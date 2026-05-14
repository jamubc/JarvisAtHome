module.exports = {
  id: 'weather',
  phrases: [
    /weather in (.+)/,
    /weather for (.+)/,
    /what's the weather in (.+)/,
    /whats the weather in (.+)/
  ],
  description: 'Get weather for a city',
  action: async (intent, say) => {
    // 1. Extract the city using Regex
    const lower = intent.transcript.toLowerCase();
    const match = lower.match(/weather (?:in|for) (.+)/);
    
    if (!match) return;
    
    // Strip punctuation
    const city = match[1].replace(/[.,?!]/g, '').trim();
    
    // 2. Provide instant synchronous feedback so the user knows Jarvis heard them
    say(`Checking the sky in ${city}...`);
    
    // 3. Fetch the weather asynchronously
    try {
      // wttr.in is a free, no-key-required weather API.
      // format=%C+and+%t returns "Partly cloudy and +15°C"
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%C+and+%t`);
      
      if (!res.ok) throw new Error("API error");
      
      let weatherString = await res.text();
      
      // Strip the + sign from temperatures so the TTS reads it naturally 
      // (e.g. "15 degrees" instead of "plus 15 degrees")
      weatherString = weatherString.replace(/\+/g, '');
      
      // 4. Provide the asynchronous feedback once the data arrives!
      say(`It is currently ${weatherString} in ${city}.`);
      
    } catch (err) {
      say(`I couldn't get the weather for ${city} right now, sir.`);
    }
  }
};
