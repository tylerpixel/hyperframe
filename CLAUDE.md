# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Hyperframe is a lightweight peer-to-peer screen sharing app. A sharer gets a memorable 2-word room code (e.g., `maple-storm`), shares their screen, and a viewer connects via that code. The server only handles WebSocket signaling — the actual video/audio stream goes directly between peers via WebRTC.

## Commands

```bash
npm install    # Install dependencies (express, ws)
npm start      # Start server on port 3000 (or PORT env var)
```

No build step, no tests, no linter. The app is vanilla JS served as static files.

## Architecture

**Server (`server.js`):** Express HTTP server + WebSocket signaling server on a single port. Handles room creation (`/api/new-room`), static file serving, subdomain detection middleware, and WebSocket message relay between sharer/viewer pairs. Rooms are stored in-memory as a `Map<roomCode, {sharer: ws, viewer: ws}>`.

**Room codes (`words.js`):** A curated list of ~175 words. `generateCode()` picks two random words joined by a hyphen. `isValidCode()` validates both words exist in the list.

**Client — two separate pages, no shared JS:**
- `public/index.html` + `public/sharer.js` — Sharer page. Fetches a room code from `/api/new-room`, connects to WebSocket as `role: 'sharer'`, captures screen via `getDisplayMedia`, creates WebRTC offer when a viewer joins.
- `public/viewer.html` + `public/viewer.js` — Viewer page. Extracts room code from URL path (`/view/word-word`) or subdomain (`word-word.hyperframe.computer`), connects to WebSocket as `role: 'viewer'`, receives WebRTC offer and sends answer. Supports fullscreen via button or double-click.

**Two routing modes for viewers:**
- Production: subdomain-based (`maple-storm.hyperframe.computer`) — detected by Express middleware
- LAN/local: path-based (`http://192.168.x.x:3000/view/maple-storm`) — standard Express route

**WebSocket message flow:** `join` → room assignment, then `offer`/`answer`/`ice-candidate` messages are relayed to the other peer in the room. Connection is 1:1 (one sharer, one viewer per room).

## Key Constraints

- `getDisplayMedia` requires HTTPS or localhost — sharers must use `localhost:3000`, not an IP address
- No TURN server configured — P2P will fail behind restrictive NATs
- ICE servers use Google's public STUN servers
- Rooms are in-memory only (lost on server restart)
- The `Brand/` directory contains business/branding assets, not application code
