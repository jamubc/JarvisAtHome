/**
 * Sleep command — special because it calls commander.sleep()
 * 
 * The action receives the intent object but also needs access to the
 * commander instance. We handle this by emitting the intent event,
 * and the main loop listens for 'sleep' commands to call commander.sleep().
 * 
 * Alternatively, this command just sets a flag — the commander checks
 * for the 'sleep' intent ID specially.
 */
module.exports = {
  id: 'sleep',
  phrases: ['go to sleep', 'sleep now', 'goodbye'],
  description: 'Go to sleep',
  // No local action — handled by commander via intent ID
};
