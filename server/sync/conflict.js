const logger = require('../utils/logger');

const SAME_TIME_THRESHOLD_SECONDS = 60;

/**
 * Determine which side wins when both have changed.
 * Strategy: last-write-wins, but GHL preferred if timestamps within 60 seconds.
 *
 * @param {string} ghlUpdatedAt - ISO timestamp of GHL update
 * @param {string} outlookUpdatedAt - ISO timestamp of Outlook update
 * @returns {'ghl' | 'outlook'} - which side's data should be kept
 */
function resolveConflict(ghlUpdatedAt, outlookUpdatedAt) {
  const ghlTime = new Date(ghlUpdatedAt).getTime();
  const outlookTime = new Date(outlookUpdatedAt).getTime();
  const diffSeconds = Math.abs(ghlTime - outlookTime) / 1000;

  // If timestamps are within threshold, prefer GHL
  if (diffSeconds <= SAME_TIME_THRESHOLD_SECONDS) {
    logger.debug({ diffSeconds }, 'Conflict within threshold — GHL wins');
    return 'ghl';
  }

  // Otherwise, last-write-wins
  const winner = ghlTime > outlookTime ? 'ghl' : 'outlook';
  logger.debug({ ghlTime, outlookTime, winner }, 'Conflict resolved by last-write-wins');
  return winner;
}

module.exports = { resolveConflict };
