const axios = require('axios');
const tokenManager = require('./token-manager');
const db = require('../db/database');
const logger = require('../utils/logger');

const GHL_BASE = 'https://services.leadconnectorhq.com';

// Get the GHL location ID from tokens table
function getLocationId() {
  const row = db.get("SELECT owner_id FROM tokens WHERE provider = 'ghl' LIMIT 1");
  if (!row) throw new Error('No GHL location connected');
  return row.owner_id;
}

async function getClient() {
  const locationId = getLocationId();
  const token = await tokenManager.getAccessToken('ghl', locationId);
  return axios.create({
    baseURL: GHL_BASE,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
  });
}

// --- Appointments ---

async function getAppointments(calendarId, startTime, endTime) {
  const client = await getClient();
  const locationId = getLocationId();
  const { data } = await client.get('/calendars/events', {
    params: { locationId, calendarId, startTime, endTime },
  });
  return data.events || [];
}

async function getAppointment(eventId) {
  const client = await getClient();
  const { data } = await client.get(`/calendars/events/${eventId}`);
  return data;
}

async function createAppointment(appointmentData) {
  const client = await getClient();
  const { data } = await client.post('/calendars/events', appointmentData);
  logger.info({ appointmentId: data.id }, 'GHL appointment created');
  return data;
}

async function updateAppointment(eventId, appointmentData) {
  const client = await getClient();
  const { data } = await client.put(`/calendars/events/${eventId}`, appointmentData);
  logger.info({ eventId }, 'GHL appointment updated');
  return data;
}

async function deleteAppointment(eventId) {
  const client = await getClient();
  await client.delete(`/calendars/events/${eventId}`);
  logger.info({ eventId }, 'GHL appointment deleted');
}

// --- Contacts ---

async function getContact(contactId) {
  const client = await getClient();
  const { data } = await client.get(`/contacts/${contactId}`);
  return data.contact;
}

async function findContactByEmail(email) {
  const client = await getClient();
  const locationId = getLocationId();
  const { data } = await client.get('/contacts/search/duplicate', {
    params: { locationId, email },
  });
  return data.contact || null;
}

// --- Workflows ---

async function triggerWorkflow(workflowId, contactId) {
  const client = await getClient();
  const { data } = await client.post(`/contacts/${contactId}/workflow/${workflowId}`, {});
  logger.info({ workflowId, contactId }, 'GHL workflow triggered');
  return data;
}

module.exports = {
  getAppointments, getAppointment, createAppointment, updateAppointment, deleteAppointment,
  getContact, findContactByEmail, triggerWorkflow, getLocationId,
};
