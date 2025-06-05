/**
 * Frontend Configuration
 * React environment variables (must start with REACT_APP_)
 */

export const frontendConfig = {
  // Backend API URL
  backendUrl: process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001',
  
  // WebSocket URL for real-time updates
  websocketUrl: process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:3001',
  
  // Optional: OpenAI API Key for client-side features (if needed)
  openaiApiKey: process.env.REACT_APP_OPENAI_API_KEY || '',
  
  // UI Configuration
  animationSpeed: 'normal', // 'slow' | 'normal' | 'fast'
  updateInterval: 5000, // 5 seconds
  
  // Feature Flags
  enableVoiceCommands: true,
  enableRealTimeUpdates: true,
  enableAnimations: true,
};

// Helper function to validate frontend config
export function validateFrontendConfig() {
  const warnings: string[] = [];
  
  if (!frontendConfig.backendUrl) {
    warnings.push('Backend URL not configured');
  }
  
  if (!frontendConfig.websocketUrl) {
    warnings.push('WebSocket URL not configured');
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️  Frontend Configuration Warnings:');
    warnings.forEach(warning => console.warn(`   • ${warning}`));
  }
  
  return warnings.length === 0;
}

export default frontendConfig; 