const { Router } = require('express');
const router = Router();
const microsoftAuth = require('../auth/microsoft');
const ghlAuth = require('../auth/ghl');
const tokenManager = require('../services/token-manager');
const db = require('../db/database');
const logger = require('../utils/logger');
const axios = require('axios');

// Initiate Microsoft OAuth for a staff member
// GET /auth/microsoft/connect?staff_id=<staffMappingId>
router.get('/microsoft/connect', (req, res) => {
  const { staff_id } = req.query;
  if (!staff_id) return res.status(400).json({ error: 'staff_id required' });

  const mapping = db.get('SELECT id FROM staff_mappings WHERE id = ?', [staff_id]);
  if (!mapping) return res.status(404).json({ error: 'Staff mapping not found' });

  const url = microsoftAuth.getAuthUrl(staff_id);
  res.redirect(url);
});

// Microsoft OAuth callback
router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'No code provided' });

    const staffMappingId = state;
    const tokenData = await microsoftAuth.exchangeCode(code);

    // Get Microsoft user info
    const { data: profile } = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    // Save tokens with staff mapping ID as owner
    tokenManager.saveTokens('microsoft', staffMappingId, {
      ...tokenData,
      extra: { email: profile.mail || profile.userPrincipalName, displayName: profile.displayName },
    });

    // Update staff mapping with Microsoft identity
    db.run(
      `UPDATE staff_mappings SET microsoft_user_id = ?, microsoft_email = ?, updated_at = datetime('now') WHERE id = ?`,
      [profile.id, profile.mail || profile.userPrincipalName, staffMappingId]
    );

    logger.info({ staffMappingId, email: profile.mail }, 'Microsoft OAuth complete');
    res.json({ success: true, message: `Connected ${profile.displayName} (${profile.mail || profile.userPrincipalName})` });
  } catch (err) {
    logger.error(err, 'Microsoft OAuth callback failed');
    res.status(500).json({ error: 'OAuth failed', details: err.message });
  }
});

// Initiate GHL OAuth (location-level)
// GET /auth/crm/connect
router.get('/crm/connect', (_req, res) => {
  const url = ghlAuth.getAuthUrl();
  res.redirect(url);
});

// GHL OAuth callback
router.get('/crm/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No code provided' });

    const tokenData = await ghlAuth.exchangeCode(code);
    const locationId = tokenData.locationId || tokenData.location_id || 'default';

    tokenManager.saveTokens('ghl', locationId, tokenData);

    logger.info({ locationId }, 'GHL OAuth complete');
    res.json({ success: true, message: `Connected GHL location: ${locationId}` });
  } catch (err) {
    logger.error(err, 'GHL OAuth callback failed');
    res.status(500).json({ error: 'OAuth failed', details: err.message });
  }
});

module.exports = router;
