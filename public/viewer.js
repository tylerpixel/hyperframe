// Viewer-side WebRTC logic

const viewerContainer = document.getElementById('viewerContainer');
const remoteVideo = document.getElementById('remoteVideo');
const overlay = document.getElementById('overlay');
const roomCodeEl = document.getElementById('roomCode');
const waitingEl = document.getElementById('waiting');
const errorEl = document.getElementById('error');
const fullscreenBtn = document.getElementById('fullscreenBtn');

let roomCode = null;
let ws = null;
let peerConnection = null;

// ICE servers for NAT traversal
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Extract room code from subdomain or URL path
function getRoomCode() {
  // Check URL path first (for LAN access: /view/word-word)
  const pathMatch = window.location.pathname.match(/^\/view\/([a-z]+-[a-z]+)$/);
  if (pathMatch) {
    return pathMatch[1];
  }

  // Check subdomain (for production: word-word.hyperframe.computer)
  const host = window.location.host;
  const parts = host.split('.');
  if (parts.length >= 2) {
    const subdomain = parts[0];
    if (subdomain.includes('-')) {
      return subdomain;
    }
  }

  return null;
}

// Initialize
function init() {
  roomCode = getRoomCode();

  if (!roomCode) {
    showError('Invalid room code');
    return;
  }

  roomCodeEl.textContent = roomCode;
  document.title = `Hyperframe - ${roomCode}`;

  connectWebSocket();
}

// Connect to signaling server
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room: roomCode, role: 'viewer' }));
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'joined':
        // Successfully joined room
        break;

      case 'sharer-joined':
        waitingEl.querySelector('span').textContent = 'Sharer connected, waiting for stream...';
        break;

      case 'sharer-left':
      case 'sharing-stopped':
        showError('Sharer has stopped sharing');
        closePeerConnection();
        break;

      case 'offer':
        await handleOffer(message);
        break;

      case 'ice-candidate':
        await handleIceCandidate(message);
        break;

      case 'error':
        showError(message.message);
        break;
    }
  };

  ws.onclose = () => {
    showError('Disconnected from server');
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    showError('Connection error');
  };
}

// Handle offer from sharer
async function handleOffer(message) {
  closePeerConnection();

  peerConnection = new RTCPeerConnection(iceServers);

  // Handle incoming tracks
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.play().catch(() => {});
    hideOverlay();
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'ice-candidate',
        candidate: event.candidate
      }));
    }
  };

  // Connection state changes
  peerConnection.onconnectionstatechange = () => {
    switch (peerConnection.connectionState) {
      case 'connected':
        hideOverlay();
        break;
      case 'disconnected':
      case 'failed':
        showError('Connection lost');
        break;
    }
  };

  // Set remote description (offer)
  const offer = new RTCSessionDescription({
    type: 'offer',
    sdp: message.sdp
  });

  await peerConnection.setRemoteDescription(offer);

  // Create and send answer
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: 'answer',
    sdp: answer.sdp
  }));
}

// Handle ICE candidate from sharer
async function handleIceCandidate(message) {
  if (!peerConnection) return;

  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
  } catch (err) {
    console.error('Error adding ICE candidate:', err);
  }
}

// Close peer connection
function closePeerConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
}

// Hide overlay (show video)
function hideOverlay() {
  overlay.classList.add('hidden');
}

// Show error
function showError(message) {
  waitingEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  errorEl.querySelector('p').textContent = message;
}

// Fullscreen toggle
fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    viewerContainer.requestFullscreen();
  }
});

// Click to unmute (browsers require user gesture for audio)
remoteVideo.addEventListener('click', () => {
  if (remoteVideo.muted) {
    remoteVideo.muted = false;
  }
});

// Double-click to toggle fullscreen
remoteVideo.addEventListener('dblclick', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    viewerContainer.requestFullscreen();
  }
});

// Initialize on load
init();
