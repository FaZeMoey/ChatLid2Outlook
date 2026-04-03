const db = require('../db/database');
const graph = require('../services/microsoft-graph');
const ghlApi = require('../services/ghl-api');
const ghlToOutlook = require('./ghl-to-outlook');
const outlookToGhl = require('./outlook-to-ghl');
const conflict = require('./conflict');
const logger = require('../utils/logger');

/**
 * Full bidirectional sync for a single staff member.
 * Called by the polling job and can be triggered manually.
 */
async function syncStaffMember(staffMapping) {
  const staffId = staffMapping.id;
  logger.info({ staffId, ghlUser: staffMapping.ghl_user_id }, 'Starting sync for staff member');

  const results = { ghlToOutlook: [], outlookToGhl: [], errors: [] };

  try {
    // 1. Get last sync time for this staff member
    const lastSync = db.get(
      `SELECT MAX(last_synced_at) as last_synced FROM sync_map WHERE staff_mapping_id = ?`,
      [staffId]
    );
    const since = lastSync?.last_synced || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 2. Fetch recent events from both sides
    const [outlookEvents, ghlAppointments] = await Promise.all([
      graph.getEvents(staffId, staffMapping.outlook_calendar_id, since).catch(err => {
        logger.error({ err, staffId }, 'Failed to fetch Outlook events');
        return [];
      }),
      fetchGhlAppointments(staffMapping, since).catch(err => {
        logger.error({ err, staffId }, 'Failed to fetch GHL appointments');
        return [];
      }),
    ]);

    // 3. Sync GHL -> Outlook (new/updated appointments not yet in sync_map or changed since last sync)
    for (const appt of ghlAppointments) {
      const existing = db.get('SELECT * FROM sync_map WHERE ghl_appointment_id = ?', [appt.id]);

      if (existing && existing.outlook_event_id) {
        // Check for conflict — both sides may have changed
        const outlookMatch = outlookEvents.find(e => e.id === existing.outlook_event_id);
        if (outlookMatch) {
          const winner = conflict.resolveConflict(
            appt.updatedAt || appt.startTime,
            outlookMatch.lastModifiedDateTime
          );
          if (winner === 'ghl') {
            const r = await ghlToOutlook.syncAppointment(appt, 'update', staffMapping);
            results.ghlToOutlook.push(r);
          } else {
            const r = await outlookToGhl.syncEvent(outlookMatch, 'updated', staffMapping);
            results.outlookToGhl.push(r);
          }
          continue;
        }
      }

      // No conflict — sync GHL to Outlook
      const r = await ghlToOutlook.syncAppointment(appt, existing ? 'update' : 'create', staffMapping);
      results.ghlToOutlook.push(r);
    }

    // 4. Sync Outlook -> GHL (events not yet in sync_map)
    for (const event of outlookEvents) {
      const existing = db.get('SELECT * FROM sync_map WHERE outlook_event_id = ?', [event.id]);
      if (existing) continue; // Already handled above or already synced

      try {
        const r = await outlookToGhl.syncEvent(event, 'created', staffMapping);
        results.outlookToGhl.push(r);
      } catch (err) {
        results.errors.push({ outlookEventId: event.id, error: err.message });
      }
    }
  } catch (err) {
    logger.error({ err, staffId }, 'Sync engine error');
    results.errors.push({ error: err.message });
  }

  logger.info({
    staffId,
    ghlToOutlook: results.ghlToOutlook.length,
    outlookToGhl: results.outlookToGhl.length,
    errors: results.errors.length,
  }, 'Sync complete for staff member');

  return results;
}

/**
 * Run sync for ALL active staff members.
 */
async function syncAll() {
  const staffList = db.all('SELECT * FROM staff_mappings WHERE is_active = 1 AND microsoft_user_id IS NOT NULL');
  logger.info({ count: staffList.length }, 'Starting sync for all staff');

  const allResults = {};
  for (const staff of staffList) {
    try {
      allResults[staff.ghl_user_id] = await syncStaffMember(staff);
    } catch (err) {
      allResults[staff.ghl_user_id] = { error: err.message };
    }
  }
  return allResults;
}

// Fetch GHL appointments for a time window
async function fetchGhlAppointments(staffMapping, since) {
  const startTime = since;
  const endTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ahead
  // GHL doesn't filter by user directly in the API — we filter client-side
  const allAppts = await ghlApi.getAppointments(null, startTime, endTime);
  return allAppts.filter(a => a.assignedUserId === staffMapping.ghl_user_id);
}

module.exports = { syncStaffMember, syncAll };
