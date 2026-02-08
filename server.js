const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
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
const TURN_KEY_ID = process.env.TURN_KEY_ID;
const TURN_KEY_API_TOKEN = process.env.TURN_KEY_API_TOKEN;

// Room storage: { roomCode: { sharer: ws, viewer: ws } }
const rooms = new Map();

// Cached Cloudflare TURN credentials
let cachedIceServers = null;
let cacheExpiry = 0;

async function getIceServers() {
  const now = Date.now();
  if (cachedIceServers && now < cacheExpiry) {
    return cachedIceServers;
  }

  if (!TURN_KEY_ID || !TURN_KEY_API_TOKEN) {
    console.warn('TURN_KEY_ID or TURN_KEY_API_TOKEN not set, using STUN only');
    return { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] };
  }

  try {
    const ttl = 86400;
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TURN_KEY_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl })
      }
    );

    if (!res.ok) {
      throw new Error(`Cloudflare TURN API returned ${res.status}`);
    }

    const data = await res.json();
    cachedIceServers = data;
    // Cache for 23 hours (credentials valid for 24)
    cacheExpiry = now + (23 * 60 * 60 * 1000);
    console.log('Fetched fresh Cloudflare TURN credentials');
    return data;
  } catch (err) {
    console.error('Failed to fetch TURN credentials:', err.message);
    // Fallback to STUN only
    return { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] };
  }
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
app.get('/api/ice-servers', async (req, res) => {
  try {
    const iceConfig = await getIceServers();
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
