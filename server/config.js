require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  adminApiKey: process.env.ADMIN_API_KEY,
  encryptionKey: process.env.ENCRYPTION_KEY,

  microsoft: {
    clientId: process.env.MS_CLIENT_ID,
    clientSecret: process.env.MS_CLIENT_SECRET,
    tenantId: process.env.MS_TENANT_ID || 'common',
    redirectUri: process.env.MS_REDIRECT_URI,
    scopes: [
      'offline_access',
      'Calendars.ReadWrite',
      'User.Read',
    ],
  },

  ghl: {
    clientId: process.env.GHL_CLIENT_ID,
    clientSecret: process.env.GHL_CLIENT_SECRET,
    redirectUri: process.env.GHL_REDIRECT_URI,
    webhookSecret: process.env.GHL_WEBHOOK_SECRET,
  },
};
