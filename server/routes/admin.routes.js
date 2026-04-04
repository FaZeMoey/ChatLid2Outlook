const { Router } = require('express');
const router = Router();
const config = require('../config');
const db = require('../db/database');
const engine = require('../sync/engine');
const graph = require('../services/microsoft-graph');
const logger = require('../utils/logger');

// Admin auth middleware
router.use((req, res, next) => {
  const key = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!key || key !== config.adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// --- Fetch GHL Users (to find user IDs) ---

router.get('/ghl-users', async (_req, res) => {
  try {
    const tokenManager = require('../services/token-manager');
    const axios = require('axios');
    const ghlApi = require('../services/ghl-api');
    const locationId = ghlApi.getLocationId();
    const token = await tokenManager.getAccessToken('ghl', locationId);

    const { data } = await axios.get(
      `https://services.leadconnectorhq.com/users/search`,
      {
        params: { companyId: locationId, locationId },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
      }
    );

    const users = (data.users || []).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    }));

    res.json({ users, locationId });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch GHL users');
    res.status(500).json({ error: err.message });
  }
});

// --- Staff Mappings CRUD ---

// List all staff mappings
router.get('/staff', (_req, res) => {
  const staff = db.all('SELECT * FROM staff_mappings ORDER BY created_at DESC');
  res.json({ staff });
});

// Create staff mapping
router.post('/staff', (req, res) => {
  const { ghl_user_id, ghl_user_name, outlook_calendar_id } = req.body;
  if (!ghl_user_id) return res.status(400).json({ error: 'ghl_user_id required' });

  try {
    const result = db.run(
      `INSERT INTO staff_mappings (ghl_user_id, ghl_user_name, outlook_calendar_id)
       VALUES (?, ?, ?)`,
      [ghl_user_id, ghl_user_name || null, outlook_calendar_id || null]
    );
    const staff = db.get('SELECT * FROM staff_mappings WHERE id = ?', [result.lastInsertRowid]);
    logger.info({ staffId: staff.id, ghlUserId: ghl_user_id }, 'Staff mapping created');
    res.status(201).json({ staff });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'GHL user already mapped' });
    }
    throw err;
  }
});

// Update staff mapping
router.patch('/staff/:id', (req, res) => {
  const { id } = req.params;
  const { ghl_user_name, outlook_calendar_id, is_active } = req.body;

  const existing = db.get('SELECT * FROM staff_mappings WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.run(
    `UPDATE staff_mappings SET
     ghl_user_name = COALESCE(?, ghl_user_name),
     outlook_calendar_id = COALESCE(?, outlook_calendar_id),
     is_active = COALESCE(?, is_active),
     updated_at = datetime('now')
     WHERE id = ?`,
    [ghl_user_name, outlook_calendar_id, is_active, id]
  );

  const updated = db.get('SELECT * FROM staff_mappings WHERE id = ?', [id]);
  res.json({ staff: updated });
});

// Delete staff mapping
router.delete('/staff/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM sync_map WHERE staff_mapping_id = ?', [id]);
  db.run('DELETE FROM subscriptions WHERE staff_mapping_id = ?', [id]);
  db.run('DELETE FROM staff_mappings WHERE id = ?', [id]);
  res.json({ success: true });
});

// --- Microsoft Subscription Management ---

// Create Graph subscription for a staff member
router.post('/staff/:id/subscribe', async (req, res) => {
  try {
    const staffMapping = db.get('SELECT * FROM staff_mappings WHERE id = ?', [req.params.id]);
    if (!staffMapping) return res.status(404).json({ error: 'Not found' });
    if (!staffMapping.microsoft_user_id) return res.status(400).json({ error: 'Staff not connected to Microsoft' });

    const sub = await graph.createSubscription(staffMapping.id, staffMapping.outlook_calendar_id);

    db.run(
      `INSERT OR REPLACE INTO subscriptions (staff_mapping_id, subscription_id, resource, expiration_date)
       VALUES (?, ?, ?, ?)`,
      [staffMapping.id, sub.id, sub.resource, sub.expirationDateTime]
    );

    res.json({ subscription: sub });
  } catch (err) {
    logger.error({ err }, 'Failed to create subscription');
    res.status(500).json({ error: err.message });
  }
});

// --- Manual Sync ---

// Sync a single staff member
router.post('/sync/staff/:id', async (req, res) => {
  const staffMapping = db.get('SELECT * FROM staff_mappings WHERE id = ?', [req.params.id]);
  if (!staffMapping) return res.status(404).json({ error: 'Not found' });

  const results = await engine.syncStaffMember(staffMapping);
  res.json({ results });
});

// Sync all staff
router.post('/sync/all', async (_req, res) => {
  const results = await engine.syncAll();
  res.json({ results });
});

// --- Sync Log ---

router.get('/sync-log', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const logs = db.all('SELECT * FROM sync_log ORDER BY created_at DESC LIMIT ?', [limit]);
  res.json({ logs });
});

// --- Stats ---

router.get('/stats', (_req, res) => {
  const staffCount = db.get('SELECT COUNT(*) as count FROM staff_mappings')?.count || 0;
  const activeStaff = db.get('SELECT COUNT(*) as count FROM staff_mappings WHERE is_active = 1 AND microsoft_user_id IS NOT NULL')?.count || 0;
  const syncMapCount = db.get('SELECT COUNT(*) as count FROM sync_map')?.count || 0;
  const recentSyncs = db.get("SELECT COUNT(*) as count FROM sync_log WHERE created_at > datetime('now', '-1 hour')")?.count || 0;
  const recentErrors = db.get("SELECT COUNT(*) as count FROM sync_log WHERE status = 'error' AND created_at > datetime('now', '-1 hour')")?.count || 0;

  res.json({ staffCount, activeStaff, syncMapCount, recentSyncs, recentErrors });
});

module.exports = router;
