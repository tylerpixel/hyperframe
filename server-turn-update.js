// Replace the TURN-related code in server.js with this

const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const TURN_SECRET = process.env.TURN_SECRET; // Shared secret from coturn config
const TURN_HOST = process.env.TURN_HOST || '5.223.48.108'; // Your server IP
const TURN_PORT = process.env.TURN_PORT || 3478;

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

// Export for reference
module.exports = { getIceServers, getTurnCredentials };
