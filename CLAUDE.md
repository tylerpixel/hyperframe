# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Hyperframe is a lightweight peer-to-peer screen sharing app. A sharer gets a memorable 2-word hyperframe code (e.g., `maple-storm`), shares their screen, and a viewer connects via that code. The server only handles WebSocket signaling — the actual video/audio stream goes directly between peers via WebRTC.

**Live at:** [hyperframe.computer](https://hyperframe.computer)

## Commands

```bash
npm install    # Install dependencies (express, ws, geist)
npm start      # Start server on port 3000 (or PORT env var)
```

No build step, no tests, no linter. The app is vanilla JS served as static files.

## Architecture

**Server (`server.js`):** Express HTTP server + WebSocket signaling server on a single port. Handles room creation (`/api/new-room`), static file serving, subdomain detection middleware, and WebSocket message relay between sharer/viewer pairs. Rooms are stored in-memory as a `Map<roomCode, {sharer: ws, viewer: ws}>`. Note: the server uses "room" terminology internally — the frontend uses "hyperframe" for all user-facing names and variable names, but sends `room` as the WebSocket message key to match the server.

**Hyperframe codes (`words.js`):** A curated list of ~175 words. `generateCode()` picks two random words joined by a hyphen. `isValidCode()` validates both words exist in the list.

**Client — two separate pages, no shared JS:**
- `public/index.html` + `public/sharer.js` — Sharer page. Fetches a hyperframe code from `/api/new-room`, connects to WebSocket as `role: 'sharer'`, captures screen via `getDisplayMedia`, creates WebRTC offer when a viewer joins. Includes click-to-copy pill with platform-aware shortcut hint (⌘C / Ctrl+C).
- `public/viewer.html` + `public/viewer.js` — Viewer page. Extracts hyperframe code from URL path (`/view/word-word`) or subdomain (`word-word.hyperframe.computer`), connects to WebSocket as `role: 'viewer'`, receives WebRTC offer and sends answer. Has a "ready state" transition when sharer connects (dark inset container) before stream begins. Supports fullscreen via button or double-click. Resets to default waiting screen on disconnect and reconnects WebSocket for resharing.

**Persistent WebSocket:** The WebSocket connection stays open for the entire session. This allows resharing — when the sharer stops and shares again, the signaling channel is still available to negotiate a new P2P connection.

**Viewer ready state (v1.2):** When the sharer joins the room but hasn't started sharing yet, the viewer transitions from the gold waiting screen to a dark inset container (`--viewer-inset` margin, `--radius-full`) showing "Waiting for host" with a radar pulse dot. Above 425px viewport width, the ready container is a third of the viewport.

**Two routing modes for viewers:**
- Production: subdomain-based (`maple-storm.hyperframe.computer`) — detected by Express middleware
- LAN/local: path-based (`http://192.168.x.x:3000/view/maple-storm`) — standard Express route

**WebSocket message flow:** `join` → room assignment, then `offer`/`answer`/`ice-candidate` messages are relayed to the other peer in the room. Connection is 1:1 (one sharer, one viewer per room).

## Design

Gold full-page design with bottom-left aligned content. All design tokens are CSS custom properties in `:root` for easy tuning:

**Design tokens (`style.css :root`):**
- **Colors:** `--gold`, `--black`, `--white`, `--error`, `--error-hover`, `--btn-hover`
- **Typography:** `--font-body`, `--font-mono`, `--text-xs`, `--text-sm`, `--text-code`, `--text-code-viewer`, `--text-ad-title`, `--text-ad-subtitle`, `--text-ad-label`
- **Spacing:** `--space-sm`, `--space-md`, `--space-lg`, `--space-xl`
- **Border radii:** `--radius-sm`, `--radius-md`, `--radius-full`
- **Sizes:** `--container-max` (420px), `--logo-height`, `--dot-size`, `--icon-size`, `--fullscreen-icon`, `--pill-border`, `--viewer-inset`
- **Animation:** `--ease`, `--duration` (90ms interactions), `--enter-duration` (300ms load), `--enter-stagger` (60ms between elements), `--active-scale`

**Animation system:**
- `.enter` class + `--i` CSS variable for staggered load animations (fade up). Gated behind `body.loaded` (added by inline script after DOM parse) to prevent jank.
- `.interactive` class for consistent hover/active transitions (90ms, `scale(--active-scale)` on `:active`).

**Layout:**
- Content anchored to bottom-left with `--space-xl` padding, `justify-content: flex-end`
- Sharer container: `width: 100%; max-width: --container-max`
- **Hyperframe code pill:** Full-width flex container with copy hint (left) and code (right)
- **Buttons:** Black pill-shaped (`--radius-md`) with white text
- **Status dots:** Radar pulse animation (`box-shadow` keyframes)
- **Ad ribbon:** Full-width, anchored to bottom of container
- **OG/Twitter meta tags:** Both pages include Open Graph and Twitter Card tags pointing to `/images/graph.png` (1200x630)

## File Structure

```
public/
  images/         # favicon.png, logo.svg, graph.png (OG image)
  fonts/          # Geist and Geist Mono variable woff2
  index.html      # Sharer page
  viewer.html     # Viewer page
  sharer.js       # Sharer-side WebRTC logic + copy-to-clipboard
  viewer.js       # Viewer-side WebRTC logic + ready state + reset
  style.css       # All styles, both pages (design tokens in :root)
server.js         # Express + WebSocket signaling
words.js          # Word list for code generation
.claude/
  settings.json   # Hooks config (auto pm2 restart on file edits)
  hooks/          # Hook scripts
```

## Key Constraints

- `getDisplayMedia` requires HTTPS or localhost — sharers must use `localhost:3000`, not an IP address
- `getDisplayMedia` is not available on iOS — screen sharing only works on desktop browsers
- TURN servers configured via openrelay.metered.ca for relay when direct P2P fails
- ICE servers use Google's public STUN servers
- Rooms are in-memory only (lost on server restart)

## Naming Convention

- **Server-side:** Uses "room" terminology (`rooms`, `roomCode`, `message.room`, `/api/new-room`)
- **Client-side:** Uses "hyperframe" terminology (`hyperframeCode`, `hyperframeCodeEl`, `.hyperframe-code`, `#hyperframeCode`) but sends `room` as the WebSocket join key to match the server protocol

## Git & Deployment

- **Repo:** `github.com/tylerpixel/hyperframe`
- **Branch:** `prod` (both local and remote)
- **Push command:** `git push origin prod`
- **Tags:** `v1.0` (initial brand redesign), `v1.1` (graceful WS disconnect), `v1.2` (gold redesign, OG tags, viewer ready state), `v1.3` (design tokens, animations, persistent WS, resharing)
- `Brand/` and `screen/` are local only — not committed
- **Git identity:** `tylerpixel` / `hey@tylerpixel.com`
- **Deployed on:** Antares (Hetzner VPS)
- **Deploy updates:** SSH to Antares, `cd /var/www/hyperframe && git pull origin prod && pm2 restart hyperframe`
