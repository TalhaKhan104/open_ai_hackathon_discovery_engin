#!/usr/bin/env node

/**
 * Backend Startup Script
 * Helps users configure and start the Discovery Engine backend
 */

const { spawn } = require('child_process');
const path = require('path');

async function startBackend() {
  console.log('🚀 Starting Ambient Discovery Engine Backend');
  console.log('============================================\n');

  // Check if API key is set
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    console.log('⚠️  OpenAI API Key Configuration Required');
    console.log('=========================================');
    console.log('');
    console.log('To use the Discovery Engine, you need an OpenAI API key:');
    console.log('1. Visit: https://platform.openai.com/api-keys');
    console.log('2. Create a new API key');
    console.log('3. Set it as an environment variable:');
    console.log('   export OPENAI_API_KEY="your-actual-api-key"');
    console.log('');
    console.log('Or edit src/backend/config.ts directly');
    console.log('');
    console.log('🔄 Starting in demo mode (limited functionality)...\n');
  } else {
    console.log('✅ OpenAI API Key configured');
    console.log('🔑 Using key: ' + apiKey.substring(0, 7) + '...\n');
  }

  console.log('🔧 Starting backend server...');
  console.log('📍 Backend will be available at: http://localhost:3001');
  console.log('🌐 Frontend should be running at: http://localhost:3000');
  console.log('📊 View logs below:\n');
  console.log('─'.repeat(50));

  // Start the backend server
  const backendPath = path.join(__dirname, 'src', 'backend');
  const serverProcess = spawn('npx', ['ts-node', 'server.ts'], {
    cwd: backendPath,
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: '1' // Enable colored output
    }
  });

  // Handle process events
  serverProcess.on('error', (error) => {
    console.error('❌ Failed to start backend:', error.message);
    process.exit(1);
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`❌ Backend exited with code ${code}`);
    } else {
      console.log('✅ Backend stopped gracefully');
    }
    process.exit(code);
  });

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down backend server...');
    serverProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    serverProcess.kill('SIGTERM');
  });
}

// Start the backend
startBackend().catch(console.error); 