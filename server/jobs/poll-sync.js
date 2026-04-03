const cron = require('node-cron');
const engine = require('../sync/engine');
const logger = require('../utils/logger');

let task;

function start() {
  // Run every 1 minute
  task = cron.schedule('* * * * *', async () => {
    logger.info('Poll sync job started');
    try {
      await engine.syncAll();
      logger.info('Poll sync job completed');
    } catch (err) {
      logger.error({ err }, 'Poll sync job failed');
    }
  });

  logger.info('Poll sync job scheduled (every 1 minute)');
}

function stop() {
  if (task) task.stop();
}

module.exports = { start, stop };
