const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./db/database');

// Initialize database
db.init();

const app = express();
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  logger.debug({ method: req.method, url: req.url }, 'request');
  next();
});

// Routes
app.use(require('./routes/health.routes'));
app.use('/auth', require('./routes/auth.routes'));
app.use('/webhooks', require('./routes/webhook.routes'));
app.use('/admin', require('./routes/admin.routes'));

// Start background jobs
require('./jobs/poll-sync').start();
require('./jobs/subscription-renew').start();

app.listen(config.port, () => {
  logger.info(`ChatLid2Outlook running on port ${config.port}`);
});
