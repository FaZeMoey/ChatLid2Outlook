const axios = require('axios');
const tokenManager = require('./token-manager');
const config = require('../config');
const logger = require('../utils/logger');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function getClient(staffMappingId) {
  const token = await tokenManager.getAccessToken('microsoft', staffMappingId);
  return axios.create({
    baseURL: GRAPH_BASE,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

// --- Calendar Events ---

async function getEvents(staffMappingId, calendarId, since) {
  const client = await getClient(staffMappingId);
  const calPath = calendarId ? `/me/calendars/${calendarId}/events` : '/me/events';
  const params = { $orderby: 'lastModifiedDateTime desc', $top: 50 };
  if (since) {
    params.$filter = `lastModifiedDateTime ge ${since}`;
  }
  const { data } = await client.get(calPath, { params });
  return data.value;
}

async function getEvent(staffMappingId, eventId) {
  const client = await getClient(staffMappingId);
  const { data } = await client.get(`/me/events/${eventId}`);
  return data;
}

async function createEvent(staffMappingId, calendarId, eventData) {
  const client = await getClient(staffMappingId);
  const calPath = calendarId ? `/me/calendars/${calendarId}/events` : '/me/events';
  const { data } = await client.post(calPath, eventData);
  logger.info({ staffMappingId, eventId: data.id }, 'Outlook event created');
  return data;
}

async function updateEvent(staffMappingId, eventId, eventData) {
  const client = await getClient(staffMappingId);
  const { data } = await client.patch(`/me/events/${eventId}`, eventData);
  logger.info({ staffMappingId, eventId }, 'Outlook event updated');
  return data;
}

async function deleteEvent(staffMappingId, eventId) {
  const client = await getClient(staffMappingId);
  await client.delete(`/me/events/${eventId}`);
  logger.info({ staffMappingId, eventId }, 'Outlook event deleted');
}

// --- Webhook Subscriptions ---

async function createSubscription(staffMappingId, calendarId) {
  const client = await getClient(staffMappingId);
  const resource = calendarId
    ? `/me/calendars/${calendarId}/events`
    : '/me/events';

  const expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 60000); // ~3 days minus 1 min

  const { data } = await client.post('/subscriptions', {
    changeType: 'created,updated,deleted',
    notificationUrl: `${config.baseUrl}/webhooks/microsoft`,
    resource,
    expirationDateTime: expiration.toISOString(),
    clientState: `staff_${staffMappingId}`,
  });

  logger.info({ staffMappingId, subscriptionId: data.id }, 'Graph subscription created');
  return data;
}

async function renewSubscription(staffMappingId, subscriptionId) {
  const client = await getClient(staffMappingId);
  const expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 60000);

  const { data } = await client.patch(`/subscriptions/${subscriptionId}`, {
    expirationDateTime: expiration.toISOString(),
  });

  logger.info({ subscriptionId }, 'Graph subscription renewed');
  return data;
}

module.exports = {
  getEvents, getEvent, createEvent, updateEvent, deleteEvent,
  createSubscription, renewSubscription,
};
