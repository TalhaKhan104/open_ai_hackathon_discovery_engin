# 🚀 Ambient Discovery Engine - Setup Guide

## 🔑 Environment Configuration

### Required: OpenAI API Key

1. **Get your API key:**
   - Visit: https://platform.openai.com/api-keys
   - Create a new API key
   - Copy the key (starts with `sk-`)

2. **Set the environment variable:**
   ```bash
   export OPENAI_API_KEY="your-actual-api-key-here"
   ```

3. **Alternative: Edit config directly:**
   - Open `src/backend/config.ts`
   - Replace `'your-openai-api-key-here'` with your actual key

### Optional: Custom Configuration

You can also set these environment variables:

```bash
# Backend Configuration
export PORT=3001
export NODE_ENV=development

# Frontend Configuration  
export REACT_APP_BACKEND_URL=http://localhost:3001
export REACT_APP_WEBSOCKET_URL=ws://localhost:3001
```

## 🚀 Starting the Application

### Option 1: Quick Start (Recommended)

1. **Set your API key:**
   ```bash
   export OPENAI_API_KEY="your-actual-api-key-here"
   ```

2. **Start backend:**
   ```bash
   node start-backend.js
   ```
   This will show helpful configuration info and start the backend with logs.

3. **Start frontend (in another terminal):**
   ```bash
   npm start
   ```

### Option 2: Manual Start

1. **Backend:**
   ```bash
   cd src/backend
   OPENAI_API_KEY="your-key" npx ts-node server.ts
   ```

2. **Frontend:**
   ```bash
   npm start
   ```

## 📱 Access Points

- **Frontend Dashboard:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/api/health

## 🔍 What You'll See

### Backend Logs
```
🚀 Multi-Agent Discovery System: Initializing...
🔬 Discovery Specialist (Technology): Initializing web search capabilities...
🔍 Novelty Validator: Initializing novelty validation system...
🤝 Agent handoffs enabled for collaborative research
🌐 Server running on http://localhost:3001
```

### Frontend Dashboard
- 🧠 Beautiful animated interface
- 🟢 Green connection indicator (when backend is running)
- 🎛️ System controls to start/stop discovery
- 🎤 Voice command input for research
- 📊 Real-time agent activity and discoveries

## 🛠️ Configuration Files

### Backend Config: `src/backend/config.ts`
```typescript
export const config = {
  openaiApiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here',
  port: process.env.PORT || 3001,
  cycleInterval: 30000, // 30 seconds between research cycles
  noveltyThreshold: 7,   // Only accept discoveries scoring 7+/10
};
```

### Frontend Config: `src/config.ts`
```typescript
export const frontendConfig = {
  backendUrl: process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001',
  websocketUrl: process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:3001',
  updateInterval: 5000, // 5 seconds
};
```

## 🧪 Testing the System

1. **Start both frontend and backend**
2. **Visit http://localhost:3000**
3. **Click "▶️ Start Discovery"** to begin ambient research
4. **Try voice commands:**
   - "research quantum computing applications"
   - "discover AI consciousness breakthroughs"
   - "explore climate technology innovations"

## 🎯 Features Available

✅ **Real web search** via OpenAI webSearchTool()  
✅ **Multi-agent collaboration** with intelligent handoffs  
✅ **Source synthesis** requiring 2+ diverse sources  
✅ **Novelty validation** with 7+ threshold  
✅ **Beautiful animated UI** with real-time updates  
✅ **Voice command interface** for directed research  
✅ **WebSocket real-time** agent communications  

## 🐛 Troubleshooting

### "Connection failed" on frontend
- Make sure backend is running on port 3001
- Check that your API key is set correctly

### "Module not found" errors
- Run `npm install` to ensure all dependencies are installed
- Make sure you're in the correct directory

### API key issues
- Verify your OpenAI API key is valid
- Check that you have sufficient credits
- Make sure the key starts with `sk-`

## 💡 Demo Ready!

Once both servers are running:
- Frontend will show real-time connection status
- Backend logs will show agent activity
- Voice commands will trigger research cycles
- Discoveries will appear with smooth animations

The system demonstrates OpenAI Agents SDK integration with beautiful real-time UI! 🎉 