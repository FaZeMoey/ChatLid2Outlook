const db = require('../db/database');
const ghlApi = require('../services/ghl-api');
const fieldMap = require('./field-map');
const logger = require('../utils/logger');

/**
 * Sync a single Outlook event to GHL.
 * Handles create, update, and delete.
 */
async function syncEvent(event, action, staffMapping) {
  const staffId = staffMapping.id;

  try {
    if (action === 'deleted') {
      return await handleDelete(event, staffId);
    }

    const existing = db.get(
      'SELECT * FROM sync_map WHERE outlook_event_id = ?',
      [event.id]
    );

    if (existing) {
      // Update existing GHL appointment
      const appointmentData = fieldMap.outlookToGhl(event, staffMapping);
      await ghlApi.updateAppointment(existing.ghl_appointment_id, appointmentData);

      db.run(
        `UPDATE sync_map SET outlook_updated_at = ?, last_sync_direction = 'outlook_to_ghl',
         last_synced_at = datetime('now') WHERE id = ?`,
        [event.lastModifiedDateTime || new Date().toISOString(), existing.id]
      );

      logSync('outlook_to_ghl', 'update', existing.ghl_appointment_id, event.id, staffId, 'success');
      return { action: 'updated', ghlAppointmentId: existing.ghl_appointment_id };
    }

    // Create new GHL appointment
    const appointmentData = fieldMap.outlookToGhl(event, staffMapping);
    const ghlAppointment = await ghlApi.createAppointment(appointmentData);

    db.run(
      `INSERT INTO sync_map (ghl_appointment_id, outlook_event_id, staff_mapping_id,
       outlook_updated_at, last_sync_direction) VALUES (?, ?, ?, ?, 'outlook_to_ghl')`,
      [ghlAppointment.id, event.id, staffId, event.lastModifiedDateTime || new Date().toISOString()]
    );

    logSync('outlook_to_ghl', 'create', ghlAppointment.id, event.id, staffId, 'success');
    return { action: 'created', ghlAppointmentId: ghlAppointment.id };
  } catch (err) {
    logger.error({ err, outlookEventId: event.id }, 'Outlook->GHL sync failed');
    logSync('outlook_to_ghl', action || 'unknown', null, event.id, staffId, 'error', err.message);
    throw err;
  }
}

async function handleDelete(event, staffId) {
  const eventId = event.id || event;
  const existing = db.get('SELECT * FROM sync_map WHERE outlook_event_id = ?', [eventId]);
  if (!existing) return { action: 'skipped', reason: 'no mapping found' };

  await ghlApi.deleteAppointment(existing.ghl_appointment_id);
  db.run('DELETE FROM sync_map WHERE id = ?', [existing.id]);
  logSync('outlook_to_ghl', 'delete', existing.ghl_appointment_id, eventId, staffId, 'success');
  return { action: 'deleted', ghlAppointmentId: existing.ghl_appointment_id };
}

function logSync(direction, action, ghlId, outlookId, staffId, status, error) {
  db.run(
    `INSERT INTO sync_log (direction, action, ghl_appointment_id, outlook_event_id,
     staff_mapping_id, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [direction, action, ghlId, outlookId, staffId, status, error || null]
  );
}

module.exports = { syncEvent };
