require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { generateCode, isValidCode } = require('./words');
const { generateOGImage } = require('./og');

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
const TURN_SECRET = process.env.TURN_SECRET; // Shared secret from coturn config
const TURN_HOST = process.env.TURN_HOST || '5.223.48.108'; // Your server IP
const TURN_PORT = process.env.TURN_PORT || 3478;

// Room storage: { roomCode: { sharer: ws, viewer: ws } }
const rooms = new Map();

// Generate time-limited TURN credentials using coturn's shared secret method
function getTurnCredentials(name) {
  const unixTimeStamp = Math.floor(Date.now() / 1000) + 24 * 3600; // Valid for 24 hours
  const username = [unixTimeStamp, name].join(':');
  const hmac = crypto.createHmac('sha1', TURN_SECRET);
  hmac.setEncoding('base64');
  hmac.write(username);
  hmac.end();
  const password = hmac.read();
  return {
    username: username,
    password: password
  };
}

function getIceServers() {
  // If no TURN secret is configured, fall back to STUN only
  if (!TURN_SECRET) {
    console.warn('TURN_SECRET not set, using STUN only');
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  // Generate fresh credentials
  const credentials = getTurnCredentials('hyperframe');
  console.log('Generated TURN credentials for relay');

  return {
    iceServers: [
      // Public STUN servers (always available, free)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Self-hosted TURN server (for relay when STUN fails)
      {
        urls: [
          `turn:${TURN_HOST}:${TURN_PORT}`,
          `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`
        ],
        username: credentials.username,
        credential: credentials.password
      }
    ]
  };
}

// Read viewer.html once at startup as a template for dynamic OG tags
const viewerTemplate = fs.readFileSync(path.join(__dirname, 'public', 'viewer.html'), 'utf8');

function serveViewerWithOG(res, code) {
  const ogUrl = `https://hyperframe.computer/og/${code}.png`;
  const html = viewerTemplate
    .replace(/https:\/\/hyperframe\.computer\/images\/graph\.png/g, ogUrl);
  res.type('html').send(html);
}

// Subdomain detection middleware
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const parts = host.split('.');
  console.log('[DEBUG] Middleware - Host:', host, '| Parts:', parts.length, '| Parts array:', JSON.stringify(parts));

  // Check for subdomain (e.g., machine-cash.hyperframe.computer or machine-cash.localhost:3000)
  // For localhost testing, handle: machine-cash.localhost:3000
  if (parts.length >= 3) {
    const subdomain = parts[0];
    // Check if it's a valid room code (word-word format)
    if (subdomain.includes('-') && isValidCode(subdomain)) {
      console.log('[DEBUG] Valid room code detected:', subdomain);
      req.roomCode = subdomain;
    }
  }
  next();
});

// Route: Dynamic OG image per hyperframe code
app.get('/og/:code.png', async (req, res) => {
  const code = req.params.code;
  if (!isValidCode(code)) {
    return res.status(404).send('Invalid code');
  }
  try {
    const buffer = await generateOGImage(code);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('OG image generation error:', err);
    res.status(500).send('Image generation failed');
  }
});

// Route: Viewer page via path (for LAN access: /view/word-word)
app.get('/view/:code', (req, res) => {
  const code = req.params.code;
  if (isValidCode(code)) {
    serveViewerWithOG(res, code);
  } else {
    res.status(404).send('Invalid room code');
  }
});

// Route: Viewer page (when accessing via subdomain)
app.get('/', (req, res) => {
  console.log('[DEBUG] GET / - req.roomCode:', req.roomCode);
  if (req.roomCode) {
    console.log('[DEBUG] Serving viewer.html for room:', req.roomCode);
    serveViewerWithOG(res, req.roomCode);
  } else {
    console.log('[DEBUG] Serving index.html (sharer page)');
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

// API: Get ICE servers with TURN credentials
app.get('/api/ice-servers', (req, res) => {
  try {
    const iceConfig = getIceServers();
    res.json(iceConfig);
  } catch (err) {
    console.error('ICE servers error:', err);
    res.status(500).json({ error: 'Failed to get ICE servers' });
  }
});

// No caching
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

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
