module.exports = {
  id: 'tell_joke',
  phrases: [
    /tell me a joke/,
    /tell a joke/,
    /make me laugh/,
    /do you know any jokes/
  ],
  description: 'Tell an interactive joke',
  // We intentionally omit the 'action' block here!
  // By doing so, handledLocally remains false. Stage 01 will send the 'tell_joke'
  // intent to the Router (Stage 02). Since there is no hardcoded hardware route
  // for 'tell_joke', the Router will seamlessly forward the request to the LLM,
  // which will then use its conversational memory to execute the joke interactively!
};
