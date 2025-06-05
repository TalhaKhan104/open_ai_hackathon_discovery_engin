/**
 * Backend Configuration
 * Set your environment variables here
 */

export const config = {
  // OpenAI API Key - REQUIRED
  // Get from: https://platform.openai.com/api-keys
  openaiApiKey: process.env.OPENAI_API_KEY || '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',
  
  // Server Configuration
  port: process.env.PORT || 3001,
  
  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // CORS Settings
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // WebSocket Configuration
  websocketHeartbeat: 30000, // 30 seconds
  
  // Discovery Engine Settings
  cycleInterval: 30000, // 30 seconds between research cycles
  maxParallelResearch: 2,
  noveltyThreshold: 7,
};

// Validation
export function validateConfig() {
  const errors: string[] = [];
  
  if (!config.openaiApiKey || !config.openaiApiKey.startsWith('sk-')) {
    errors.push('OPENAI_API_KEY is required and must start with "sk-". Get one from https://platform.openai.com/api-keys');
  }
  
  if (errors.length > 0) {
    console.warn('⚠️  Configuration Issues:');
    errors.forEach(error => console.warn(`   • ${error}`));
    console.warn('   The system will run in demo mode with limited functionality.\n');
  }
  
  return errors.length === 0;
}

export default config; 