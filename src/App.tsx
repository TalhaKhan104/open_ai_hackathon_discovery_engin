import React, { useState, useEffect } from 'react';
import './App.css';

interface Discovery {
  id: string;
  topic: string;
  finding: string;
  novelty: string;
  timestamp: string;
}

function App() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    // Connect to backend WebSocket
    const ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('Connected to discovery engine');
      setIsConnected(true);
      setStatus('Connected - Researching...');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'discovery') {
        setDiscoveries(prev => [data.discovery, ...prev.slice(0, 9)]); // Keep last 10
      } else if (data.type === 'status') {
        setStatus(data.message);
      }
    };
    
    ws.onclose = () => {
      setIsConnected(false);
      setStatus('Disconnected');
    };
    
    return () => ws.close();
  }, []);

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      backgroundColor: '#f8fafc',
      minHeight: '100vh'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '700', 
          color: '#1e293b',
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          🧠 AI Discovery Engine
        </h1>
        
        <div style={{ 
          marginBottom: '24px', 
          padding: '12px 16px', 
          backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
          border: `1px solid ${isConnected ? '#16a34a' : '#dc2626'}`,
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          <span style={{ color: isConnected ? '#16a34a' : '#dc2626' }}>
            {isConnected ? '🟢' : '🔴'} {status}
          </span>
        </div>

        <h2 style={{ 
          fontSize: '20px', 
          fontWeight: '600', 
          color: '#374151',
          marginBottom: '16px'
        }}>
          Latest Discoveries
        </h2>
        
        {discoveries.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
            <p style={{ color: '#6b7280', fontSize: '16px' }}>
              Waiting for AI to discover novel insights...
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {discoveries.map((discovery, index) => (
              <div key={discovery.id} style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                animation: index === 0 ? 'fadeIn 0.5s ease-in' : undefined
              }}>
                <div style={{ 
                  fontSize: '12px', 
                  color: '#6b7280', 
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ 
                    backgroundColor: '#f3f4f6',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '500'
                  }}>
                    {discovery.topic}
                  </span>
                  <span>{discovery.timestamp}</span>
                </div>
                
                <div style={{ 
                  fontSize: '18px', 
                  fontWeight: '600', 
                  color: '#111827',
                  marginBottom: '12px',
                  lineHeight: '1.4'
                }}>
                  {discovery.finding}
                </div>
                
                <div style={{ 
                  fontSize: '14px', 
                  color: '#4b5563',
                  lineHeight: '1.5',
                  padding: '12px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  borderLeft: '3px solid #3b82f6'
                }}>
                  <strong>Why it's novel:</strong> {discovery.novelty}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default App;
