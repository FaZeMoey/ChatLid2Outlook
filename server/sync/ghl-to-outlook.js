const db = require('../db/database');
const graph = require('../services/microsoft-graph');
const fieldMap = require('./field-map');
const logger = require('../utils/logger');

/**
 * Sync a single GHL appointment to Outlook.
 * Handles create, update, and delete.
 */
async function syncAppointment(appointment, action, staffMapping) {
  const staffId = staffMapping.id;
  const calendarId = staffMapping.outlook_calendar_id || null;

  try {
    if (action === 'delete') {
      return await handleDelete(appointment, staffId);
    }

    const existing = db.get(
      'SELECT * FROM sync_map WHERE ghl_appointment_id = ?',
      [appointment.id]
    );

    if (existing) {
      // Update existing Outlook event
      const eventData = fieldMap.ghlToOutlook(appointment);
      await graph.updateEvent(staffId, existing.outlook_event_id, eventData);

      db.run(
        `UPDATE sync_map SET ghl_updated_at = ?, last_sync_direction = 'ghl_to_outlook',
         last_synced_at = datetime('now') WHERE id = ?`,
        [appointment.updatedAt || new Date().toISOString(), existing.id]
      );

      logSync('ghl_to_outlook', 'update', appointment.id, existing.outlook_event_id, staffId, 'success');
      return { action: 'updated', outlookEventId: existing.outlook_event_id };
    }

    // Create new Outlook event
    const eventData = fieldMap.ghlToOutlook(appointment);
    const outlookEvent = await graph.createEvent(staffId, calendarId, eventData);

    db.run(
      `INSERT INTO sync_map (ghl_appointment_id, outlook_event_id, staff_mapping_id,
       ghl_updated_at, last_sync_direction) VALUES (?, ?, ?, ?, 'ghl_to_outlook')`,
      [appointment.id, outlookEvent.id, staffId, appointment.updatedAt || new Date().toISOString()]
    );

    logSync('ghl_to_outlook', 'create', appointment.id, outlookEvent.id, staffId, 'success');
    return { action: 'created', outlookEventId: outlookEvent.id };
  } catch (err) {
    logger.error({ err, ghlAppointmentId: appointment.id }, 'GHL->Outlook sync failed');
    logSync('ghl_to_outlook', action || 'unknown', appointment.id, null, staffId, 'error', err.message);
    throw err;
  }
}

async function handleDelete(appointment, staffId) {
  const existing = db.get(
    'SELECT * FROM sync_map WHERE ghl_appointment_id = ?',
    [appointment.id]
  );
  if (!existing) return { action: 'skipped', reason: 'no mapping found' };

  await graph.deleteEvent(staffId, existing.outlook_event_id);
  db.run('DELETE FROM sync_map WHERE id = ?', [existing.id]);
  logSync('ghl_to_outlook', 'delete', appointment.id, existing.outlook_event_id, staffId, 'success');
  return { action: 'deleted', outlookEventId: existing.outlook_event_id };
}

function logSync(direction, action, ghlId, outlookId, staffId, status, error) {
  db.run(
    `INSERT INTO sync_log (direction, action, ghl_appointment_id, outlook_event_id,
     staff_mapping_id, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [direction, action, ghlId, outlookId, staffId, status, error || null]
  );
}

module.exports = { syncAppointment };
