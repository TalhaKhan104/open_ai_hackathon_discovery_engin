import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentController, SystemStatus } from './controllers/AgentController';
import { config, validateConfig } from './config';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Configuration
const PORT = config.port;
const OPENAI_API_KEY = config.openaiApiKey;

// Validate configuration
console.log('🔧 Validating configuration...');
const isConfigValid = validateConfig();

if (!isConfigValid) {
  console.log('💡 To set your OpenAI API key:');
  console.log('   • Set environment variable: export OPENAI_API_KEY="your-key"');
  console.log('   • Or edit src/backend/config.ts directly\n');
}

// Initialize Agent Controller
const agentController = new AgentController(OPENAI_API_KEY);

// Middleware
app.use(cors({
  origin: config.frontendUrl,
  credentials: true
}));
app.use(express.json());

// WebSocket connections for real-time updates
const wsConnections = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket connection established');
  wsConnections.add(ws);
  
  // Send initial system status
  const status = agentController.getSystemStatus();
  ws.send(JSON.stringify({ type: 'system_status', data: status }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'voice_command') {
        await agentController.processVoiceCommand(data.command);
        broadcastToClients({ type: 'voice_processed', command: data.command });
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
    wsConnections.delete(ws);
  });
});

// Broadcast function for real-time updates
function broadcastToClients(data: any) {
  const message = JSON.stringify(data);
  wsConnections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// API Routes

// System Management
app.get('/api/status', (req, res) => {
  const status = agentController.getSystemStatus();
  res.json(status);
});

app.post('/api/start', async (req, res) => {
  try {
    await agentController.start();
    const status = agentController.getSystemStatus();
    
    // Broadcast system start to WebSocket clients
    broadcastToClients({ type: 'system_started', data: status });
    
    res.json({ success: true, message: 'Discovery system started', status });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

app.post('/api/stop', async (req, res) => {
  try {
    await agentController.stop();
    const status = agentController.getSystemStatus();
    
    // Broadcast system stop to WebSocket clients
    broadcastToClients({ type: 'system_stopped', data: status });
    
    res.json({ success: true, message: 'Discovery system stopped', status });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Discovery Management
app.get('/api/discoveries', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const discoveries = agentController.getRecentDiscoveries(limit);
  res.json(discoveries);
});

app.get('/api/threads', (req, res) => {
  const threads = agentController.getAllThreads();
  res.json(threads);
});

app.get('/api/threads/:threadId', (req, res) => {
  const thread = agentController.getDiscoveryThread(req.params.threadId);
  if (thread) {
    res.json(thread);
  } else {
    res.status(404).json({ error: 'Thread not found' });
  }
});

// Voice Commands
app.post('/api/voice-command', async (req: Request, res: Response): Promise<void> => {
  try {
    const { command } = req.body;
    
    if (!command || typeof command !== 'string') {
      res.status(400).json({ error: 'Command is required and must be a string' });
      return;
    }
    
    await agentController.processVoiceCommand(command);
    
    // Broadcast voice command to WebSocket clients
    broadcastToClients({ type: 'voice_command_processed', command });
    
    res.json({ success: true, message: 'Voice command processed', command });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Agent Statistics
app.get('/api/agents', (req, res) => {
  const stats = agentController.getAgentStats();
  res.json(stats);
});

app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const messages = agentController.getRecentMessages(limit);
  res.json(messages);
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Real-time status updates
setInterval(() => {
  if (wsConnections.size > 0) {
    const status = agentController.getSystemStatus();
    const recentMessages = agentController.getRecentMessages(5);
    
    broadcastToClients({ 
      type: 'real_time_update', 
      data: { 
        status, 
        recentMessages,
        timestamp: new Date().toISOString()
      } 
    });
  }
}, 5000); // Update every 5 seconds

// Initialize and start server
async function startServer() {
  try {
    console.log('🚀 Initializing Ambient Discovery Engine...');
    
    // Initialize the agent system
    await agentController.initialize();
    
    // Start the HTTP server
    server.listen(PORT, () => {
      console.log(`🌐 Server running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket server ready for real-time connections`);
      console.log('\n📋 Available API Endpoints:');
      console.log('   GET  /api/status           - System status');
      console.log('   POST /api/start            - Start discovery system');
      console.log('   POST /api/stop             - Stop discovery system');
      console.log('   GET  /api/discoveries      - Recent discoveries');
      console.log('   GET  /api/threads          - Discovery threads');
      console.log('   POST /api/voice-command    - Process voice commands');
      console.log('   GET  /api/agents           - Agent statistics');
      console.log('   GET  /api/messages         - Recent agent messages');
      console.log('\n🎤 Voice Commands:');
      console.log('   "research [topic]"         - Direct research focus');
      console.log('\n💡 Ready for ambient discovery!');
    });
    
    // Auto-start the discovery system
    console.log('\n🔄 Auto-starting discovery system...');
    await agentController.start();
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  try {
    await agentController.stop();
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  await agentController.stop();
  process.exit(0);
});

// Start the server
startServer(); 