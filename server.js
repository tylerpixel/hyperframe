const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const { generateCode, isValidCode } = require('./words');

// Get local network IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Room storage: { roomCode: { sharer: ws, viewer: ws } }
const rooms = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Subdomain detection middleware
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const parts = host.split('.');

  // Check for subdomain (e.g., machine-cash.hyperframe.computer or machine-cash.localhost:3000)
  // For localhost testing, handle: machine-cash.localhost:3000
  if (parts.length >= 2) {
    const subdomain = parts[0];
    // Check if it's a valid room code (word-word format)
    if (subdomain.includes('-') && isValidCode(subdomain)) {
      req.roomCode = subdomain;
    }
  }
  next();
});

// Route: Viewer page via path (for LAN access: /view/word-word)
app.get('/view/:code', (req, res) => {
  const code = req.params.code;
  if (isValidCode(code)) {
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
  } else {
    res.status(404).send('Invalid room code');
  }
});

// Route: Viewer page (when accessing via subdomain)
app.get('/', (req, res) => {
  if (req.roomCode) {
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// API: Generate a new room code
app.get('/api/new-room', (req, res) => {
  let code;
  let attempts = 0;

  // Generate unique code (not already in use)
  do {
    code = generateCode();
    attempts++;
  } while (rooms.has(code) && attempts < 100);

  if (attempts >= 100) {
    return res.status(503).json({ error: 'No available rooms' });
  }

  res.json({ code, lanIP: getLocalIP(), port: PORT });
});

// WebSocket signaling
wss.on('connection', (ws, req) => {
  let currentRoom = null;
  let role = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'join':
          handleJoin(ws, message.room, message.role);
          currentRoom = message.room;
          role = message.role;
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
        case 'sharing-stopped':
          relayToRoom(currentRoom, role, message);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('Message parse error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      handleLeave(currentRoom, role);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

function handleJoin(ws, roomCode, role) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, { sharer: null, viewer: null });
  }

  const room = rooms.get(roomCode);

  if (role === 'sharer') {
    if (room.sharer) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room already has a sharer' }));
      return;
    }
    room.sharer = ws;
    ws.send(JSON.stringify({ type: 'joined', role: 'sharer' }));

    // Notify viewer if present
    if (room.viewer) {
      room.viewer.send(JSON.stringify({ type: 'sharer-joined' }));
    }
  } else if (role === 'viewer') {
    if (room.viewer) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room already has a viewer' }));
      return;
    }
    room.viewer = ws;
    ws.send(JSON.stringify({ type: 'joined', role: 'viewer' }));

    // Notify sharer if present
    if (room.sharer) {
      room.sharer.send(JSON.stringify({ type: 'viewer-joined' }));
    }
  }
}

function handleLeave(roomCode, role) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (role === 'sharer') {
    room.sharer = null;
    if (room.viewer) {
      room.viewer.send(JSON.stringify({ type: 'sharer-left' }));
    }
  } else if (role === 'viewer') {
    room.viewer = null;
    if (room.sharer) {
      room.sharer.send(JSON.stringify({ type: 'viewer-left' }));
    }
  }

  // Clean up empty rooms
  if (!room.sharer && !room.viewer) {
    rooms.delete(roomCode);
  }
}

function relayToRoom(roomCode, senderRole, message) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const target = senderRole === 'sharer' ? room.viewer : room.sharer;
  if (target && target.readyState === 1) {
    target.send(JSON.stringify(message));
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hyperframe server running on http://localhost:${PORT}`);
  console.log(`LAN viewer URL: http://[your-ip]:${PORT}/view/[room-code]`);
});
