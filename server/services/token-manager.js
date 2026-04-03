const db = require('../db/database');
const { encrypt, decrypt } = require('../utils/crypto');
const microsoftAuth = require('../auth/microsoft');
const ghlAuth = require('../auth/ghl');
const logger = require('../utils/logger');

// Save or update tokens for a provider/owner
function saveTokens(provider, ownerId, tokenData) {
  const existing = db.get('SELECT id FROM tokens WHERE provider = ? AND owner_id = ?', [provider, ownerId]);
  const expiresAt = tokenData.expires_in
    ? Math.floor(Date.now() / 1000) + tokenData.expires_in
    : null;

  if (existing) {
    db.run(
      `UPDATE tokens SET access_token = ?, refresh_token = ?, expires_at = ?,
       extra = ?, updated_at = datetime('now') WHERE provider = ? AND owner_id = ?`,
      [
        encrypt(tokenData.access_token),
        encrypt(tokenData.refresh_token),
        expiresAt,
        tokenData.extra ? JSON.stringify(tokenData.extra) : null,
        provider,
        ownerId,
      ]
    );
  } else {
    db.run(
      `INSERT INTO tokens (provider, owner_id, access_token, refresh_token, expires_at, extra)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        provider,
        ownerId,
        encrypt(tokenData.access_token),
        encrypt(tokenData.refresh_token),
        expiresAt,
        tokenData.extra ? JSON.stringify(tokenData.extra) : null,
      ]
    );
  }
}

// Get a valid access token, refreshing if expired
async function getAccessToken(provider, ownerId) {
  const row = db.get('SELECT * FROM tokens WHERE provider = ? AND owner_id = ?', [provider, ownerId]);
  if (!row) throw new Error(`No tokens found for ${provider}/${ownerId}`);

  const now = Math.floor(Date.now() / 1000);
  // Refresh if expiring within 5 minutes
  if (row.expires_at && row.expires_at - now < 300) {
    logger.info({ provider, ownerId }, 'Refreshing expired token');
    const refreshToken = decrypt(row.refresh_token);
    let newTokens;

    if (provider === 'microsoft') {
      newTokens = await microsoftAuth.refreshAccessToken(refreshToken);
    } else {
      newTokens = await ghlAuth.refreshAccessToken(refreshToken);
    }

    saveTokens(provider, ownerId, newTokens);
    return newTokens.access_token;
  }

  return decrypt(row.access_token);
}

module.exports = { saveTokens, getAccessToken };
