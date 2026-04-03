const cron = require('node-cron');
const db = require('../db/database');
const graph = require('../services/microsoft-graph');
const logger = require('../utils/logger');

let task;

function start() {
  // Run every 12 hours — renew subscriptions expiring within 24 hours
  task = cron.schedule('0 */12 * * *', async () => {
    logger.info('Subscription renewal job started');

    try {
      const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const expiring = db.all(
        'SELECT * FROM subscriptions WHERE expiration_date < ?',
        [cutoff]
      );

      logger.info({ count: expiring.length }, 'Subscriptions to renew');

      for (const sub of expiring) {
        try {
          const renewed = await graph.renewSubscription(sub.staff_mapping_id, sub.subscription_id);

          db.run(
            'UPDATE subscriptions SET expiration_date = ? WHERE id = ?',
            [renewed.expirationDateTime, sub.id]
          );

          logger.info({ subscriptionId: sub.subscription_id }, 'Subscription renewed');
        } catch (err) {
          logger.error({ err, subscriptionId: sub.subscription_id }, 'Failed to renew subscription');

          // If renewal fails (e.g. subscription deleted), try recreating
          if (err.response?.status === 404) {
            try {
              const staffMapping = db.get('SELECT * FROM staff_mappings WHERE id = ?', [sub.staff_mapping_id]);
              if (staffMapping) {
                const newSub = await graph.createSubscription(staffMapping.id, staffMapping.outlook_calendar_id);
                db.run(
                  'UPDATE subscriptions SET subscription_id = ?, expiration_date = ? WHERE id = ?',
                  [newSub.id, newSub.expirationDateTime, sub.id]
                );
                logger.info({ oldId: sub.subscription_id, newId: newSub.id }, 'Subscription recreated');
              }
            } catch (recreateErr) {
              logger.error({ err: recreateErr }, 'Failed to recreate subscription');
            }
          }
        }
      }

      logger.info('Subscription renewal job completed');
    } catch (err) {
      logger.error({ err }, 'Subscription renewal job failed');
    }
  });

  logger.info('Subscription renewal job scheduled (every 12 hours)');
}

function stop() {
  if (task) task.stop();
}

module.exports = { start, stop };
