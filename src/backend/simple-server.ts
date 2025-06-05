import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Agent, run } from '@openai/agents';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Simple configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const PORT = 3001;

// Set the API key for OpenAI Agents SDK
if (OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = OPENAI_API_KEY;
} else {
  console.warn('⚠️  OPENAI_API_KEY not set! Please set your API key as an environment variable.');
}

// WebSocket connections
const clients = new Set<WebSocket>();

// Simple Research Agent
const researchAgent = new Agent({
  name: 'Discovery Researcher',
  instructions: `You are an AI researcher that discovers novel insights. 
    1. Generate interesting research topics about emerging technologies
    2. Research them using your knowledge and reasoning
    3. Find novel, surprising discoveries
    4. Explain why each discovery is novel and important
    
    Always respond with JSON in this format:
    {
      "topic": "research topic",
      "finding": "the novel discovery",
      "novelty": "why this is novel and important"
    }`,
  model: 'gpt-4o-mini'
});

// Broadcast to all connected clients
function broadcast(data: any) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Main discovery function
async function discoverNovelInsights() {
  try {
    broadcast({ type: 'status', message: 'Generating research topic...' });
    
    // Generate a research topic
    const topicPrompt = `Generate one specific, interesting research topic about emerging technology trends, scientific breakthroughs, or novel applications. Just return the topic as plain text, no JSON.`;
    
    const topicResult = await run(researchAgent, topicPrompt);
    const topic = extractText(topicResult);
    
    broadcast({ type: 'status', message: `Researching: ${topic}` });
    
    // Research the topic and find novel insights
    const researchPrompt = `Research this topic: "${topic}"
    
    Find 1 specific, novel discovery that most people don't know about. 
    Focus on something surprising or recently discovered.
    
    Respond with JSON: {"finding": "the discovery", "novelty": "why it's novel"}`;
    
    const researchResult = await run(researchAgent, researchPrompt);
    const discoveryText = extractText(researchResult);
    
    console.log('Raw discovery text:', discoveryText.substring(0, 500) + '...');
    
    // Try to extract JSON from the response
    let finding = 'Could not parse finding';
    let novelty = 'Could not parse novelty';
    
    try {
      // Remove ```json``` wrapper if present
      let cleanText = discoveryText;
      if (discoveryText.includes('```json')) {
        const jsonMatch = discoveryText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          cleanText = jsonMatch[1];
        }
      }
      
      // Try to parse the JSON
      const parsed = JSON.parse(cleanText);
      finding = parsed.finding || 'No finding extracted';
      novelty = parsed.novelty || 'No novelty extracted';
      
      console.log('✅ Successfully parsed JSON');
      
    } catch (error) {
      console.log('❌ JSON parsing failed, using raw text');
      finding = discoveryText; // Fallback to raw text
    }
    
    // Create discovery object with parsed data
    const discovery = {
      id: Date.now().toString(),
      topic: topic.substring(0, 100) + (topic.length > 100 ? '...' : ''),
      finding: finding,
      novelty: novelty,
      timestamp: new Date().toLocaleTimeString()
    };
    
    console.log('🔍 Raw Discovery Created:', discovery.id);
    
    // Send to frontend
    broadcast({ type: 'discovery', discovery });
    
    broadcast({ type: 'status', message: 'Discovery complete. Next in 30s...' });
    
  } catch (error) {
    console.error('Discovery error:', error);
    broadcast({ type: 'status', message: 'Research error. Retrying...' });
  }
}

// Extract text content from OpenAI Agents response
function extractText(result: any): string {
  console.log('\n=== FULL JSON BREAKDOWN ===');
  console.log('Result type:', typeof result);
  console.log('Result is array:', Array.isArray(result));
  
  if (result) {
    console.log('Top-level keys:', Object.keys(result));
    
    // Break down each top-level property
    Object.keys(result).forEach(key => {
      console.log(`\n--- ANALYZING: ${key} ---`);
      console.log(`${key} type:`, typeof result[key]);
      
      if (result[key] && typeof result[key] === 'object') {
        console.log(`${key} keys:`, Object.keys(result[key]));
        
        // If it's the state object, dive deeper
        if (key === 'state') {
          console.log('\n🔍 DIVING INTO STATE:');
          Object.keys(result[key]).forEach(stateKey => {
            console.log(`state.${stateKey} type:`, typeof result[key][stateKey]);
            
            if (stateKey === '_currentStep' && result[key][stateKey]) {
              console.log('\n🎯 FOUND _currentStep:');
              console.log('_currentStep keys:', Object.keys(result[key][stateKey]));
              
              if (result[key][stateKey].output) {
                console.log('🎉 FOUND OUTPUT:', result[key][stateKey].output);
                return result[key][stateKey].output;
              }
            }
          });
        }
      }
    });
  }
  
  // Handle string responses
  if (typeof result === 'string') {
    console.log('✅ Returning string result');
    return result;
  }
  
  // Try different extraction paths
  console.log('\n=== TRYING EXTRACTION PATHS ===');
  
  // Path 1: result.state._currentStep.output
  if (result?.state?._currentStep?.output) {
    console.log('✅ PATH 1 WORKED: result.state._currentStep.output');
    return result.state._currentStep.output;
  } else {
    console.log('❌ PATH 1 FAILED: result.state._currentStep.output');
  }
  
  // Path 2: result.state._lastModelResponse.output[0].content[0].text
  if (result?.state?._lastModelResponse?.output?.[0]?.content?.[0]?.text) {
    console.log('✅ PATH 2 WORKED: result.state._lastModelResponse text');
    return result.state._lastModelResponse.output[0].content[0].text;
  } else {
    console.log('❌ PATH 2 FAILED: result.state._lastModelResponse');
  }
  
  // Path 3: result.currentStep.output (fallback)
  if (result?.currentStep?.output) {
    console.log('✅ PATH 3 WORKED: result.currentStep.output');
    return result.currentStep.output;
  } else {
    console.log('❌ PATH 3 FAILED: result.currentStep.output');
  }
  
  // Path 4: Array format
  if (Array.isArray(result) && result[0]?.content?.[0]?.text) {
    console.log('✅ PATH 4 WORKED: Array format');
    return result[0].content[0].text;
  } else {
    console.log('❌ PATH 4 FAILED: Array format');
  }
  
  console.log('❌ ALL PATHS FAILED - Returning JSON string');
  return JSON.stringify(result).substring(0, 1000) + '...';
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('🔌 Client connected');
  clients.add(ws);
  
  // Start discovery when first client connects
  if (clients.size === 1) {
    console.log('🚀 Starting discovery engine...');
    startDiscoveryLoop();
  }
  
  ws.on('close', () => {
    console.log('🔌 Client disconnected');
    clients.delete(ws);
  });
});

// Discovery loop
let discoveryInterval: NodeJS.Timeout | null = null;

function startDiscoveryLoop() {
  if (discoveryInterval) clearInterval(discoveryInterval);
  
  // Run discovery immediately, then every 30 seconds
  discoverNovelInsights();
  discoveryInterval = setInterval(discoverNovelInsights, 30000);
}

// CORS and basic setup
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
server.listen(PORT, () => {
  console.log(`🌐 Simple Discovery Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket ready for connections`);
  console.log(`🤖 Research Agent initialized`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  
  // Clear discovery interval
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
  }
  
  // Close all WebSocket connections
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
  });
  clients.clear();
  
  // Close WebSocket server
  wss.close(() => {
    console.log('✅ WebSocket server closed');
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after 2 seconds if graceful shutdown fails
  setTimeout(() => {
    console.log('⚡ Force exiting...');
    process.exit(1);
  }, 2000);
}); 