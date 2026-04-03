const config = require('../config');

const GHL_AUTH_BASE = 'https://marketplace.gohighlevel.com';
const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';

// Build GHL OAuth2 authorization URL (location-level install)
function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: config.ghl.clientId,
    response_type: 'code',
    redirect_uri: config.ghl.redirectUri,
    scope: [
      'calendars.readonly',
      'calendars/events.readwrite',
      'contacts.readwrite',
      'workflows.readonly',
    ].join(' '),
  });
  return `${GHL_AUTH_BASE}/oauth/chooselocation?${params}`;
}

// Exchange authorization code for tokens
async function exchangeCode(code) {
  const axios = require('axios');
  const { data } = await axios.post(
    GHL_TOKEN_URL,
    new URLSearchParams({
      client_id: config.ghl.clientId,
      client_secret: config.ghl.clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return data; // { access_token, refresh_token, expires_in, locationId, ... }
}

// Refresh an expired access token
async function refreshAccessToken(refreshToken) {
  const axios = require('axios');
  const { data } = await axios.post(
    GHL_TOKEN_URL,
    new URLSearchParams({
      client_id: config.ghl.clientId,
      client_secret: config.ghl.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return data;
}

module.exports = { getAuthUrl, exchangeCode, refreshAccessToken };
