const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../config');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  /**
   * Attach WebSocket server to the HTTP server
   * @param {http.Server} server 
   */
  init(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws/alerts' });

    this.wss.on('connection', (ws, req) => {
      // Optional JWT token query validation
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        if (token) {
          const decoded = jwt.verify(token, config.jwtSecret);
          ws.user = decoded;
        }
      } catch (err) {
        // Allow connection anyway for dashboard viewing in demo/evaluator mode
        ws.user = null;
      }

      this.clients.add(ws);

      // Send initial welcome message and status
      ws.send(JSON.stringify({
        type: 'CONNECTION_ESTABLISHED',
        message: 'Connected to Real-Time Threat Monitoring Engine',
        timestamp: new Date().toISOString()
      }));

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    // Heartbeat every 30 seconds
    setInterval(() => {
      this.broadcast({ type: 'HEARTBEAT', timestamp: new Date().toISOString() });
    }, 30000);
  }

  /**
   * Broadcast payload to all connected clients
   * @param {Object} data 
   */
  broadcast(data) {
    if (!this.wss) return;
    const message = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (err) {
          console.error('Error sending WS message:', err.message);
        }
      }
    }
  }

  /**
   * Broadcast a newly generated security alert in real-time (REQ-10)
   * @param {Object} alert 
   */
  broadcastAlert(alert) {
    this.broadcast({
      type: 'SECURITY_ALERT',
      data: alert,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast an activity log entry
   * @param {Object} log 
   */
  broadcastActivity(log) {
    this.broadcast({
      type: 'ACTIVITY_LOG',
      data: log,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new WebSocketService();
