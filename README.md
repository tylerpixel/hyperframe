# Hyperframe.computer

Lightweight peer-to-peer screen sharing with memorable 2-word room codes.

## Features

- **Screen + Audio Sharing** - Share your screen with system audio
- **True P2P** - Direct WebRTC connection, server only handles signaling
- **Memorable Codes** - Room codes like `maple-storm` instead of random strings
- **One Viewer** - Simple 1:1 sharing
- **Minimal** - No frameworks, just vanilla JS

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start
```

Then open `http://localhost:3000`

## How It Works

1. **Sharer** visits `hyperframe.computer` → sees code like `machine-cash`
2. **Sharer** clicks "Share Screen" → selects screen/window
3. **Viewer** visits `machine-cash.hyperframe.computer` → sees the stream
4. Connection is direct P2P after signaling

## Local Testing

For subdomain testing locally, you'll need to:

1. Add to `/etc/hosts`:
   ```
   127.0.0.1 test-code.localhost
   ```

2. Or use a tool like `lvh.me` which resolves all subdomains to 127.0.0.1:
   ```
   http://localhost:3000        # Sharer
   http://maple-storm.lvh.me:3000  # Viewer
   ```

## Production Deployment (Hetzner)

1. Point `*.hyperframe.computer` DNS to your server (wildcard A record)
2. Set up SSL with Let's Encrypt (wildcard cert)
3. Run with PM2 or systemd:
   ```bash
   pm2 start server.js --name hyperframe
   ```

### Nginx Config (optional, for SSL termination)

```nginx
server {
    listen 443 ssl http2;
    server_name hyperframe.computer *.hyperframe.computer;

    ssl_certificate /etc/letsencrypt/live/hyperframe.computer/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hyperframe.computer/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Tech Stack

- Node.js + Express
- WebSocket (ws library)
- WebRTC (native browser APIs)
- Vanilla CSS/JS
