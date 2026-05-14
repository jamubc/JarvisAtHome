/**
 * Command: Get the current time
 * 
 * To add a new command, create a new .js file in this directory.
 * Export an object with:
 *   - id:          Unique identifier (used by downstream pipeline)
 *   - phrases:     Array of trigger phrases (matched via .includes())
 *   - description: Human-readable description
 *   - action:      Optional function to run locally (receives intent object)
 */

module.exports = {
  id: 'get_time',
  phrases: [
    "what's the time",
    "whats the time",
    "what is the time",
    "tell me the time",
    "current time",
    "what time is it",
  ],
  description: 'Tell the current time',
  action: () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    console.log(`\n  🕐  The time is ${timeStr}\n`);
  },
};
