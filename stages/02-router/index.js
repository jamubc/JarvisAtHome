const path = require('path');
const fs = require('fs');

// Load .env from project root (two levels up from stages/02-router/)
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const mqtt = require('mqtt');
const { chat } = require('./src/llm');
const { logUtterance } = require('./src/decide/log');

// ─────────────────────────────────────────────────────────
// Load config + routes
// ─────────────────────────────────────────────────────────
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const routes = JSON.parse(fs.readFileSync(path.join(__dirname, 'routes.json'), 'utf8'));

// Remove the _comment key from routes
delete routes._comment;

// Keep the last 6 messages for context
let conversationHistory = [];

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🧠  STAGE 02 — CENTRAL ROUTER (Main Brain)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Show route table
  const routeCount = Object.keys(routes).length;
  console.log(`\n  ${routeCount} routes loaded from routes.json:`);
  for (const [id, route] of Object.entries(routes)) {
    if (route.target === 'hardware') {
      console.log(`    ⚡ ${id} → ${route.topic} (${route.payload})`);
    } else if (route.target === 'system') {
      console.log(`    💻 ${id} → ${route.topic}`);
    } else if (route.target === 'local') {
      console.log(`    🏠 ${id} → handled locally`);
    }
  }

  // Show LLM status
  const hasKey = process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your-key-here';
  console.log(`\n  LLM: ${hasKey ? '✅ OpenRouter connected' : '⚠️  No API key — set OPENROUTER_API_KEY in .env'}`);
  const modelToUse = process.env.OPENROUTER_MODEL || config.llm.model;
  console.log(`  Model: ${modelToUse}`);

  // Connect to MQTT
  console.log(`\n  Connecting to MQTT broker: ${config.mqtt.broker}...`);
  const client = mqtt.connect(config.mqtt.broker);

  client.on('connect', () => {
    console.log('  ✅  Connected to MQTT broker.');

    // Subscribe to intent topics
    for (const topic of config.mqtt.subscriptions) {
      client.subscribe(topic, (err) => {
        if (err) console.error(`  ⚠️  Failed to subscribe to ${topic}:`, err.message);
        else console.log(`  📡  Subscribed to: ${topic}`);
      });
    }

    console.log('\n  Listening for intents...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });

  client.on('message', async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.transcript) {
        logUtterance({ transcript: payload.transcript, topic, intent: payload.id || 'chat' });
      }
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // ───────────────────────────────────────────────────
      // ROUTE 1: Known command intent
      // ───────────────────────────────────────────────────
      if (topic === 'jarvis/intent/command' && payload.id) {

        // ───────────────────────────────────────────────────
        // ROUTE: Wikipedia Search + LLM Summarization
        // ───────────────────────────────────────────────────
        if (payload.id === 'wikipedia_search') {
          console.log(`  [${timestamp}] 📖 Triggered Wikipedia Search`);

          // 1. Extract the topic by stripping away the trigger words and punctuation
          let searchTopic = payload.transcript.toLowerCase()
            .replace(/jarvis/g, '')
            .replace(/search wikipedia for/g, '')
            .replace(/look up on wikipedia/g, '')
            .replace(/wikipedia/g, '')
            .replace(/[.,?!]/g, '') // 👈 ADD THIS LINE: Strips out punctuation
            .trim();

          if (!searchTopic) {
            client.publish('jarvis/tts/speak', "I didn't catch the topic you wanted me to search for, sir.");
            return; // Exit early
          }

          console.log(`  [${timestamp}] 🌐 Fetching Wiki page for: "${searchTopic}"`);
          client.publish('jarvis/tts/speak', "One second...");

          try {
            // 2. Fetch the raw summary directly from Wikipedia's open API
            const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTopic)}`;
            const wikiRes = await fetch(wikiUrl);
            
            if (!wikiRes.ok) throw new Error('Article not found');
            
            const wikiData = await wikiRes.json();
            const rawExtract = wikiData.extract;

            console.log(`  [${timestamp}] 🤔 Wiki data retrieved. Sending to LLM for conversational summary...`);

            // 3. Force the LLM to act as a TTS formatter
            const llmPrompt = `You are Jarvis. You just looked up "${searchTopic}" on Wikipedia. Summarize the following extract for a Text-to-Speech engine. Make it sound conversational, natural, and keep it under 3 sentences. Here is the extract: "${rawExtract}"`;
            
            const finalResponse = await chat(config.llm, llmPrompt);
            
            // 4. Send the polished response to the speaker module
            client.publish('jarvis/tts/speak', finalResponse);
            console.log(`  [${timestamp}] 🔊 → jarvis/tts/speak: "${finalResponse}"`);

          } catch (err) {
            console.error(`  [${timestamp}] ⚠️ Wikipedia error:`, err.message);
            client.publish('jarvis/tts/speak', `I couldn't find a Wikipedia article for ${searchTopic}, sir.`);
          }
          
          return; // Exit so it doesn't fall through to other routes
        }

        const route = routes[payload.id];

        if (route) {
          console.log(`  [${timestamp}] 📥 Intent: ${payload.id} ("${payload.transcript}")`);

          if (route.target === 'hardware') {
            // Publish to hardware MQTT topic
            client.publish(route.topic, route.payload);
            console.log(`  [${timestamp}] ⚡ → ${route.topic} = ${route.payload}`);
            if (route.response) {
              client.publish('jarvis/tts/speak', route.response);
              console.log(`  [${timestamp}] 🔊 → "${route.response}"`);
            }
          }

          else if (route.target === 'system') {
            // Publish to system topic for Stage 04 to handle
            client.publish(route.topic, route.payload || '{}');
            console.log(`  [${timestamp}] 💻 → ${route.topic}`);
          }

          else if (route.target === 'local') {
            // Handled locally by Stage 01, no forwarding needed
            console.log(`  [${timestamp}] 🏠 Handled locally (${route.handler})`);
            
            if (payload.id === 'get_time') {
              const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              const spokenResponse = `It is currently ${timeStr}.`;
              client.publish('jarvis/tts/speak', spokenResponse);
              console.log(`  [${timestamp}] 🔊 → "${spokenResponse}"`);
            }
          }

        } else if (payload.handledLocally) {
          // Handled dynamically by a drop-in module in Stage 01
          console.log(`  [${timestamp}] 🧩 Handled by Stage 01 Module (${payload.id})`);
        } else {
          // Known intent but no route AND not handled locally
          console.log(`  [${timestamp}] ❓ No route for intent: ${payload.id} — forwarding to LLM`);
          await routeToLLM(client, payload.transcript, timestamp);
        }
      }

      // ───────────────────────────────────────────────────
      // ROUTE 2: Unrecognized / conversational
      // ───────────────────────────────────────────────────
      else if (topic === 'jarvis/intent/chat') {
        console.log(`  [${timestamp}] 💬 Chat: "${payload.transcript}"`);
        await routeToLLM(client, payload.transcript, timestamp);
      }

    } catch (err) {
      console.error('  ⚠️  Error processing message:', err.message);
    }
  });

  client.on('error', (err) => {
    console.error('  ⚠️  MQTT error:', err.message);
  });

  client.on('offline', () => {
    console.log('  ⚠️  MQTT broker offline — retrying...');
  });

  // Clean shutdown
  process.on('SIGINT', () => {
    console.log('\n\n  👋  Shutting down router...');
    client.end();
    console.log('  ✅  Disconnected from MQTT.\n');
    process.exit(0);
  });
}

/**
 * Route a message to the LLM and publish the response to TTS.
 */
async function routeToLLM(client, transcript, timestamp) {
  console.log(`  [${timestamp}] 🤔 Thinking: Forwarding to Semantic Router...`);
  
  // 1. Play a quick "hmm" or "thinking" acknowledgment
  client.publish('jarvis/tts/speak', "One moment.");

  // 2. Add user's new message to history
  conversationHistory.push({ role: 'user', content: transcript });
  if (conversationHistory.length > 6) conversationHistory.shift();

  const availableIntents = Object.keys(routes).join(', ');
  
  // 3. The Upgraded System Prompt
  const systemPrompt = `You are Jarvis, an AI system controller. 
Available hardware/system actions: [${availableIntents}].

Look at the conversation history and the user's latest request. YOU MUST OUTPUT ONLY VALID JSON. DO NOT REASON OUT LOUD. DO NOT THINK. START YOUR RESPONSE IMMEDIATELY WITH THE { CHARACTER AND END WITH THE } CHARACTER:
1. If their request perfectly matches an action, reply strictly with JSON: {"intent": "action_id"}
2. If you need the user to answer back (e.g. clarifying an action, OR waiting for them to respond to a joke setup like "Knock knock"), reply strictly with JSON: {"clarify": "Your question or joke setup."}
3. If it is a general conversation or the final punchline of a joke, reply strictly with JSON: {"chat": "Your response."} IMPORTANT FOR JOKES: NEVER deliver the setup and punchline at the same time. Use the "clarify" response to deliver the setup and wait for the user. If they guess the punchline correctly, sarcastically call them out! Keep it concise.`;

  // 4. Send the prompt + history to the LLM
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];
  
  const startTime = Date.now();
  const rawResponse = await chat(config.llm, messages);
  const elapsed = Date.now() - startTime;
  
  try {
    // Robustly extract JSON if the LLM outputted reasoning text around it
    let jsonString = rawResponse;
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    } else {
      const braceMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonString = braceMatch[0];
      }
    }

    const decision = JSON.parse(jsonString);
    console.log(`  [${timestamp}] 🧠 LLM Decision Output:`, decision);
    
    // Save AI's response to history
    conversationHistory.push({ role: 'assistant', content: JSON.stringify(decision) });
    if (conversationHistory.length > 6) conversationHistory.shift();

    if (decision.intent && routes[decision.intent]) {
      console.log(`  [${timestamp}] 🎯 LLM triggered: ${decision.intent}`);
      client.publish('jarvis/intent/command', JSON.stringify({ id: decision.intent, transcript }));
    } 
    
    else if (decision.clarify) {
      console.log(`  [${timestamp}] ❓ LLM needs clarification: "${decision.clarify}"`);
      client.publish('jarvis/tts/speak', decision.clarify);
      
      // Tell Stage 01 to immediately start listening after speaking!
      client.publish('jarvis/state/listen_now', 'true');
    }
    
    else if (decision.chat) {
      console.log(`  [${timestamp}] 💬 LLM Chat: "${decision.chat}"`);
      client.publish('jarvis/tts/speak', decision.chat);
    } 
    
    else {
      console.error(`  [${timestamp}] ⚠️ Unhandled JSON format from LLM:`, decision);
      // Fallback to whichever key seems like text, or fail
      const fallbackText = decision.response || decision.text || decision.message || "I lost my train of thought, sir.";
      client.publish('jarvis/tts/speak', fallbackText);
    }
  } catch (e) {
    // Fallback if LLM doesn't output valid JSON
    console.error(`  [${timestamp}] ⚠️ Failed to parse LLM JSON:`, rawResponse);
    client.publish('jarvis/tts/speak', "I'm having trouble thinking right now.");
  }
}

main();
