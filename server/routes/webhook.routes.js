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
router.post('/ghl', async (req, res) => {
  res.sendStatus(200);

  try {
    const payload = req.body;
    const eventType = payload.type || payload.event;

    logger.info({ eventType }, 'GHL webhook received');

    // Map GHL webhook event types to actions
    let action;
    if (eventType?.includes('create') || eventType?.includes('Create')) action = 'create';
    else if (eventType?.includes('update') || eventType?.includes('Update')) action = 'update';
    else if (eventType?.includes('delete') || eventType?.includes('Delete')) action = 'delete';
    else {
      logger.debug({ eventType }, 'Ignoring unhandled GHL webhook type');
      return;
    }

    const appointment = payload.data || payload;
    const assignedUserId = appointment.assignedUserId || appointment.userId;

    if (!assignedUserId) {
      logger.warn('GHL webhook missing assignedUserId');
      return;
    }

    // Find the staff mapping for this GHL user
    const staffMapping = db.get(
      'SELECT * FROM staff_mappings WHERE ghl_user_id = ? AND is_active = 1',
      [assignedUserId]
    );

    if (!staffMapping) {
      logger.warn({ assignedUserId }, 'No staff mapping for GHL user');
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

module.exports = router;
