const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Redis } = require('@upstash/redis');
const bip39 = require('bip39');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});

// Upstash Redis client setup
const redis = new Redis({
  url: `https://${process.env.REDIS_URL}`,
  token: process.env.REDIS_TOKEN
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Generate a random two-word mnemonic for subdomain
function generateSubdomainMnemonic() {
  const words = bip39.generateMnemonic(32).split(' ').slice(0, 2);
  return words.join('-');
}

// Generate a four-word mnemonic for session
function generateSessionMnemonic() {
  const words = bip39.generateMnemonic(64).split(' ').slice(0, 4);
  return words.join('-');
}

// Route to create new session
app.post('/api/session', async (req, res) => {
  try {
    const subdomain = generateSubdomainMnemonic();
    const sessionMnemonic = generateSessionMnemonic();
    
    // Store session info in Redis with 24hr expiry
    await redis.set(`session:${subdomain}`, JSON.stringify({
      mnemonic: sessionMnemonic,
      created: Date.now(),
      connected: false
    }), { ex: 86400 }); // Upstash uses options object for expiry
    
    res.json({ subdomain, sessionMnemonic });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Route to validate and join session
app.post('/api/session/join', async (req, res) => {
  try {
    const { subdomain, mnemonic } = req.body;
    
    const sessionData = await redis.get(`session:${subdomain}`);
    if (!sessionData) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = JSON.parse(sessionData);
    if (session.mnemonic !== mnemonic) {
      return res.status(401).json({ error: 'Invalid mnemonic' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Session join error:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// WebRTC signaling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-room', async (subdomain) => {
    socket.join(subdomain);
    console.log(`Socket ${socket.id} joined room ${subdomain}`);
  });
  
  socket.on('offer', (data) => {
    socket.to(data.subdomain).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });
  
  socket.on('answer', (data) => {
    socket.to(data.subdomain).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });
  
  socket.on('ice-candidate', (data) => {
    socket.to(data.subdomain).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 