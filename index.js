const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🚀  JARVIS SYSTEM LAUNCHER');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const stagesDir = path.join(__dirname, 'stages');
const stages = fs.readdirSync(stagesDir)
  .filter(f => fs.statSync(path.join(stagesDir, f)).isDirectory())
  .sort();

const processes = [];

for (const stage of stages) {
  const stagePath = path.join(stagesDir, stage);
  const indexPath = path.join(stagePath, 'index.js');
  
  // Only start stages that have an index.js
  if (fs.existsSync(indexPath)) {
    console.log(`  Starting ${stage}...`);
    
    const p = spawn('node', ['index.js'], { 
      cwd: stagePath,
      stdio: 'pipe'
    });

    // Color code output by stage
    const prefix = `[${stage.split('-')[0]}]`;
    const color = stage.startsWith('01') ? '\x1b[36m' : '\x1b[35m'; // Cyan for 01, Magenta for 02
    const reset = '\x1b[0m';

    p.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim() !== '');
      for (const line of lines) {
        console.log(`${color}${prefix}${reset} ${line}`);
      }
    });

    p.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim() !== '');
      for (const line of lines) {
        console.error(`${color}${prefix}${reset} ${line}`);
      }
    });

    processes.push(p);
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.on('SIGINT', () => {
  console.log('\n  Shutting down all stages...');
  for (const p of processes) {
    p.kill('SIGINT');
  }
  process.exit(0);
});
