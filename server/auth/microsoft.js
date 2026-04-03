const config = require('../config');

const AUTHORITY = `https://login.microsoftonline.com/${config.microsoft.tenantId}`;

// Build the Microsoft OAuth2 authorization URL for a staff member
function getAuthUrl(staffMappingId) {
  const params = new URLSearchParams({
    client_id: config.microsoft.clientId,
    response_type: 'code',
    redirect_uri: config.microsoft.redirectUri,
    scope: config.microsoft.scopes.join(' '),
    response_mode: 'query',
    state: String(staffMappingId),
    prompt: 'consent',
  });
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params}`;
}

// Exchange authorization code for tokens
async function exchangeCode(code) {
  const axios = require('axios');
  const { data } = await axios.post(
    `${AUTHORITY}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: config.microsoft.clientId,
      client_secret: config.microsoft.clientSecret,
      code,
      redirect_uri: config.microsoft.redirectUri,
      grant_type: 'authorization_code',
      scope: config.microsoft.scopes.join(' '),
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return data; // { access_token, refresh_token, expires_in, ... }
}

// Refresh an expired access token
async function refreshAccessToken(refreshToken) {
  const axios = require('axios');
  const { data } = await axios.post(
    `${AUTHORITY}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: config.microsoft.clientId,
      client_secret: config.microsoft.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: config.microsoft.scopes.join(' '),
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return data;
}

module.exports = { getAuthUrl, exchangeCode, refreshAccessToken };
