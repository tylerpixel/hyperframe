# Hyperframe.computer - Development Chat Log

## Project Overview
Lightweight, secure, peer-to-peer screen sharing app using WebRTC with memorable 2-word mnemonic room codes.

## What Was Built

### File Structure
```
Hyperframe/
├── server.js          # Express + WebSocket signaling server
├── words.js           # 175 curated words for mnemonic generation
├── package.json       # Dependencies (express, ws)
├── README.md          # Documentation
└── public/
    ├── index.html     # Sharer page
    ├── viewer.html    # Viewer page
    ├── style.css      # Dark theme styling
    ├── sharer.js      # Screen capture + WebRTC (sharer)
    └── viewer.js      # WebRTC receive + display (viewer)
```

### Features Implemented
- Screen + system audio capture via `getDisplayMedia`
- True P2P WebRTC streaming (server only relays signaling)
- Memorable 2-word room codes (e.g., `maple-storm`)
- Wildcard subdomain routing for production (`code.hyperframe.computer`)
- Path-based routing for LAN (`192.168.0.8:3000/view/code`)
- Clean minimal dark UI
- Fullscreen mode for viewers
- Auto-cleanup when peers disconnect

## Changes Made During Session

### 1. Removed Preview from Sharer
User requested: "I want the sharer side to have no part for viewing their stream, only the viewer side can see the screen."

**Files changed:**
- `public/index.html` - Removed preview video container
- `public/sharer.js` - Removed preview-related code
- `public/style.css` - Removed `.preview-container` styles

### 2. Added LAN Support
Problem: Subdomain routing doesn't work with IP addresses for local network testing.

**Solution:** Added path-based routing (`/view/:code`) alongside subdomain routing.

**Files changed:**
- `server.js`:
  - Added `/view/:code` route
  - Server now listens on `0.0.0.0` (all interfaces)
  - API returns `lanIP` and `port` for viewer URL generation
  - Added `getLocalIP()` function using `os.networkInterfaces()`

- `public/viewer.js`:
  - `getRoomCode()` now checks URL path first (`/view/word-word`), then subdomain

- `public/sharer.js`:
  - Detects if accessed via IP or localhost
  - Uses server-provided LAN IP to generate viewer URL
  - Added check for `getDisplayMedia` availability (requires HTTPS or localhost)

## How to Run

```bash
cd /Users/tylerpixel/Hyperframe
npm start
```

### For LAN Testing
1. **Sharer (computer)**: Open `http://localhost:3000`
   - Must use `localhost` (not IP) because `getDisplayMedia` requires secure context
2. **Viewer (phone)**: Open the displayed URL like `http://192.168.0.8:3000/view/maple-storm`

### For Production
- Sharer visits `hyperframe.computer`
- Viewer visits `maple-storm.hyperframe.computer`
- Requires wildcard DNS and HTTPS

## Known Issues / TODO

1. **HTTPS Required for Production**: `getDisplayMedia` requires HTTPS (or localhost)
2. **Screen sharing indicator stuck**: macOS indicator may persist after closing browser - fully quit browser with Cmd+Q or check System Settings → Privacy & Security → Screen Recording
3. **No TURN server**: May fail behind restrictive NATs (can add TURN server later)

## Local IP
Current LAN IP: `192.168.0.8`

## Dependencies
```json
{
  "express": "^4.18.2",
  "ws": "^8.16.0"
}
```
