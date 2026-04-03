const { Router } = require('express');
const router = Router();
const db = require('../db/database');
const ghlToOutlook = require('../sync/ghl-to-outlook');
const outlookToGhl = require('../sync/outlook-to-ghl');
const graph = require('../services/microsoft-graph');
const logger = require('../utils/logger');

// --- Microsoft Graph Webhook ---
// POST /webhooks/microsoft
router.post('/microsoft', async (req, res) => {
  // Graph sends a validation request on subscription creation
  if (req.query.validationToken) {
    logger.info('Microsoft Graph subscription validation');
    return res.status(200).type('text/plain').send(req.query.validationToken);
  }

  // Process notifications
  const notifications = req.body?.value;
  if (!notifications || !Array.isArray(notifications)) {
    return res.sendStatus(202);
  }

  // Respond immediately — process async
  res.sendStatus(202);

  for (const notification of notifications) {
    try {
      const clientState = notification.clientState || '';
      const staffIdMatch = clientState.match(/^staff_(\d+)$/);
      if (!staffIdMatch) {
        logger.warn({ clientState }, 'Unknown clientState in Graph notification');
        continue;
      }

      const staffMappingId = parseInt(staffIdMatch[1]);
      const staffMapping = db.get('SELECT * FROM staff_mappings WHERE id = ?', [staffMappingId]);
      if (!staffMapping) continue;

      const changeType = notification.changeType; // created, updated, deleted
      const resourceId = notification.resourceData?.id;

      if (!resourceId) continue;

      if (changeType === 'deleted') {
        await outlookToGhl.syncEvent({ id: resourceId }, 'deleted', staffMapping);
      } else {
        // Fetch the full event from Graph
        const event = await graph.getEvent(staffMappingId, resourceId);
        await outlookToGhl.syncEvent(event, changeType, staffMapping);
      }

      logger.info({ changeType, resourceId, staffMappingId }, 'Microsoft webhook processed');
    } catch (err) {
      logger.error({ err, notification }, 'Failed to process Microsoft webhook');
    }
  }
});

// --- GHL Webhook ---
// POST /webhooks/ghl
// Handles both standard GHL webhook payloads AND custom workflow webhook data
router.post('/ghl', async (req, res) => {
  res.sendStatus(200);

  try {
    const payload = req.body;
    logger.info({ payload }, 'GHL webhook received');

    // Normalize the appointment data — handle custom workflow fields
    const appointment = normalizeGhlPayload(payload);

    if (!appointment.id) {
      logger.warn('GHL webhook missing appointment ID');
      return;
    }

    // Determine action from event type or default to 'update'
    const eventType = payload.type || payload.event || payload.event_type || '';
    let action = 'update';
    if (eventType.toLowerCase().includes('create') || eventType.toLowerCase().includes('new')) action = 'create';
    else if (eventType.toLowerCase().includes('delete') || eventType.toLowerCase().includes('cancel')) action = 'delete';

    // Find staff mapping by assignedUserId or by contact email
    const assignedUserId = appointment.assignedUserId;
    let staffMapping;

    if (assignedUserId) {
      staffMapping = db.get(
        'SELECT * FROM staff_mappings WHERE ghl_user_id = ? AND is_active = 1',
        [assignedUserId]
      );
    }

    // If no direct match, try to find by existing sync_map entry
    if (!staffMapping && appointment.id) {
      const syncEntry = db.get('SELECT staff_mapping_id FROM sync_map WHERE ghl_appointment_id = ?', [appointment.id]);
      if (syncEntry) {
        staffMapping = db.get('SELECT * FROM staff_mappings WHERE id = ? AND is_active = 1', [syncEntry.staff_mapping_id]);
      }
    }

    if (!staffMapping) {
      logger.warn({ assignedUserId, appointmentId: appointment.id }, 'No staff mapping found for webhook');
      return;
    }

    if (!staffMapping.microsoft_user_id) {
      logger.warn({ assignedUserId }, 'Staff not connected to Microsoft');
      return;
    }

    await ghlToOutlook.syncAppointment(appointment, action, staffMapping);
    logger.info({ action, appointmentId: appointment.id }, 'GHL webhook processed');
  } catch (err) {
    logger.error({ err }, 'Failed to process GHL webhook');
  }
});

// Normalize GHL payload — maps custom workflow fields to standard format
function normalizeGhlPayload(payload) {
  const data = payload.data || payload;
  return {
    id: data.appointment_id || data.id || data.eventId,
    title: data.appointment_title || data.title || data.name,
    startTime: data.appointment_start_time || data.startTime || data.start_time,
    endTime: data.appointment_end_time || data.endTime || data.end_time,
    notes: data.appointment_notes || data.notes || data.description,
    meetingLocation: data.appointment_meeting_location || data.meetingLocation || data.location,
    contactId: data.contact_id || data.contactId,
    contactName: data.contact_full_name || data.contactName,
    contactEmail: data.contact_email || data.contactEmail,
    contactPhone: data.contact_phone || data.contactPhone,
    assignedUserId: data.assignedUserId || data.assigned_user_id || data.userId,
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

module.exports = router;
