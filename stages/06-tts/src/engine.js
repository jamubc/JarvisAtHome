const { exec } = require('child_process');

function speak(text, config) {
  return new Promise((resolve) => {
    // Sanitize text to prevent command line injection
    const safeText = text.replace(/"/g, "'").replace(/\n/g, ' ');
    const engine = config.activeEngine;

    console.log(`  🗣️  [${engine}] Speaking: "${safeText}"`);

    if (engine === 'macos_say') {
      const opts = config.engines.macos_say;
      // Uses the native macOS TTS
      exec(`say -v ${opts.voice} -r ${opts.rate} "${safeText}"`, resolve);
    } 
    
    else if (engine === 'piper') {
      const opts = config.engines.piper;
      const command = `echo "${safeText}" | ${opts.executable} --model ${opts.modelPath} --output_file temp.wav && afplay temp.wav`;
      exec(command, resolve);
    }

    else if (engine === 'windows_native') {
      const command = `powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${safeText}')"`;
      exec(command, resolve);
    }
    
    else {
      console.error(`  ⚠️  Unknown TTS engine: ${engine}`);
      resolve();
    }
  });
}

module.exports = { speak };
