/**
 * Field mapping between GHL appointments and Outlook calendar events.
 *
 * GHL appointment shape:
 *   { id, calendarId, title, contactId, assignedUserId,
 *     startTime (ISO), endTime (ISO), status, notes, ... }
 *
 * Outlook event shape:
 *   { id, subject, body: { contentType, content }, start: { dateTime, timeZone },
 *     end: { dateTime, timeZone }, isAllDay, location, ... }
 */

// Convert GHL appointment -> Outlook event body
function ghlToOutlook(appointment) {
  return {
    subject: appointment.title || 'GHL Appointment',
    body: {
      contentType: 'Text',
      content: [
        appointment.notes || '',
        `\n---\nGHL Appointment ID: ${appointment.id}`,
        appointment.contactId ? `Contact ID: ${appointment.contactId}` : '',
      ].filter(Boolean).join('\n'),
    },
    start: {
      dateTime: appointment.startTime,
      timeZone: 'UTC',
    },
    end: {
      dateTime: appointment.endTime,
      timeZone: 'UTC',
    },
    isAllDay: false,
  };
}

// Convert Outlook event -> GHL appointment body
function outlookToGhl(event, staffMapping) {
  return {
    calendarId: staffMapping.ghl_calendar_id || undefined,
    title: event.subject || 'Outlook Event',
    startTime: event.start.dateTime,
    endTime: event.end.dateTime,
    assignedUserId: staffMapping.ghl_user_id,
    notes: extractPlainText(event.body),
  };
}

// Extract plain text from Outlook event body
function extractPlainText(body) {
  if (!body || !body.content) return '';
  if (body.contentType === 'Text') return body.content;
  // Strip HTML tags for HTML content
  return body.content.replace(/<[^>]*>/g, '').trim();
}

module.exports = { ghlToOutlook, outlookToGhl };
