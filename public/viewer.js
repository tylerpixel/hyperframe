// Viewer-side WebRTC logic

const viewerContainer = document.getElementById('viewerContainer');
const remoteVideo = document.getElementById('remoteVideo');
const overlay = document.getElementById('overlay');
const hyperframeCodeEl = document.getElementById('hyperframeCode');
const waitingEl = document.getElementById('waiting');
const errorEl = document.getElementById('error');
const fullscreenBtn = document.getElementById('fullscreenBtn');

let hyperframeCode = null;
let ws = null;
let peerConnection = null;

// ICE servers fetched from server (Cloudflare TURN)
let iceServers = null;

async function fetchIceServers() {
  try {
    const res = await fetch('/api/ice-servers');
    const data = await res.json();
    iceServers = data;
    console.log('ICE servers loaded:', iceServers.iceServers.length, 'servers');
  } catch (err) {
    console.error('Failed to fetch ICE servers, using STUN fallback:', err);
    iceServers = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] };
  }
}

// Extract hyperframe code from subdomain or URL path
function getHyperframeCode() {
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
async function init() {
  await fetchIceServers();
  hyperframeCode = getHyperframeCode();

  if (!hyperframeCode) {
    showError('Invalid hyperframe code');
    return;
  }

  hyperframeCodeEl.textContent = hyperframeCode;
  document.title = `Hyperframe - ${hyperframeCode}`;

  connectWebSocket();
}

// Connect to signaling server
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room: hyperframeCode, role: 'viewer' }));
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'joined':
        // Successfully joined hyperframe
        break;

      case 'sharer-joined':
        viewerContainer.classList.add('ready');
        waitingEl.querySelector('span').textContent = 'Waiting for host';
        break;

      case 'sharer-left':
      case 'sharing-stopped':
        resetToDefault();
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
    console.log('Track received:', event.track.kind, 'readyState:', event.track.readyState);
    console.log('Stream:', event.streams[0].id, 'active:', event.streams[0].active);

    remoteVideo.srcObject = event.streams[0];

    // Log video element state
    console.log('Video element - readyState:', remoteVideo.readyState, 'paused:', remoteVideo.paused);

    // Try to play immediately
    const playPromise = remoteVideo.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('Video autoplay started successfully');
          hideOverlay();
        })
        .catch((err) => {
          console.log('Autoplay blocked, waiting for user interaction:', err.name, err.message);
          // Video will play on click - keep overlay visible with instructions
        });
    }
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('ICE candidate generated:', event.candidate.candidate);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON()
        }));
        console.log('Sent ICE candidate to sharer');
      } else {
        console.error('Cannot send ICE candidate - WebSocket not open');
      }
    } else {
      console.log('ICE gathering complete');
    }
  };

  // Connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('Peer connection state:', peerConnection.connectionState);
    switch (peerConnection.connectionState) {
      case 'connected':
        console.log('Peer connection established');
        hideOverlay();
        break;
      case 'disconnected':
      case 'failed':
        console.error('Peer connection failed or disconnected');
        resetToDefault();
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
  if (!peerConnection) {
    console.error('Received ICE candidate but no peer connection exists');
    return;
  }

  try {
    console.log('Received ICE candidate from sharer:', message.candidate.candidate);
    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    console.log('Successfully added ICE candidate');
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

// Reset to default waiting screen
function resetToDefault() {
  closePeerConnection();
  overlay.classList.remove('hidden');
  viewerContainer.classList.remove('ready');
  waitingEl.classList.remove('hidden');
  waitingEl.querySelector('span').textContent = 'Waiting for Sharer';
  errorEl.classList.add('hidden');

  // Reconnect WebSocket if closed
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
  }
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

// Click to play/unmute (browsers require user gesture for audio)
remoteVideo.addEventListener('click', () => {
  // Start playing if paused (in case autoplay was blocked)
  if (remoteVideo.paused) {
    remoteVideo.play();
  }

  // Unmute on click
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

// Listen for video playing event to hide overlay
remoteVideo.addEventListener('playing', () => {
  console.log('Video is now playing');
  hideOverlay();
});

// Initialize on load
init();
