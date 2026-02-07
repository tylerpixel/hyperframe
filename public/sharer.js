// Sharer-side WebRTC and screen capture logic

const roomCodeEl = document.getElementById('roomCode');
const roomUrlEl = document.getElementById('roomUrl');
const shareBtn = document.getElementById('shareBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

let roomCode = null;
let ws = null;
let peerConnection = null;
let localStream = null;
let viewerPresent = false;

// ICE servers for NAT traversal
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Initialize: Get a room code
async function init() {
  try {
    const res = await fetch('/api/new-room');
    const data = await res.json();
    roomCode = data.code;

    roomCodeEl.textContent = roomCode;

    // Build viewer URL
    const host = window.location.host;
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    let viewerUrl;

    // Check if using IP address or localhost
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isIP) {
      // Already on LAN IP: use path-based URL
      viewerUrl = `${protocol}//${host}/view/${roomCode}`;
    } else if (isLocalhost) {
      // On localhost: use server-provided LAN IP for viewer
      viewerUrl = `http://${data.lanIP}:${data.port}/view/${roomCode}`;
    } else {
      // Production: use subdomain
      const baseDomain = host.split('.').slice(-2).join('.');
      viewerUrl = `${protocol}//${roomCode}.${baseDomain}`;
    }

    roomUrlEl.innerHTML = `Viewer URL: <a href="${viewerUrl}" target="_blank">${viewerUrl}</a>`;

    connectWebSocket();
  } catch (err) {
    setStatus('Failed to get room code', 'error');
    console.error(err);
  }
}

// Connect to signaling server
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room: roomCode, role: 'sharer' }));
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'joined':
        setStatus('Room created. Waiting for viewer...');
        break;

      case 'viewer-joined':
        viewerPresent = true;
        setStatus('Viewer connected!', 'connected');
        // If we're already sharing, create offer
        if (localStream) {
          await createOffer();
        }
        break;

      case 'viewer-left':
        viewerPresent = false;
        setStatus('Viewer disconnected');
        closePeerConnection();
        break;

      case 'answer':
        await handleAnswer(message);
        break;

      case 'ice-candidate':
        await handleIceCandidate(message);
        break;

      case 'error':
        setStatus(message.message, 'error');
        break;
    }
  };

  ws.onclose = () => {
    setStatus('Disconnected from server', 'error');
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    setStatus('Connection error', 'error');
  };
}

// Start screen sharing
async function startSharing() {
  // Check if screen sharing is available (requires HTTPS or localhost)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setStatus('Screen sharing requires HTTPS. Use localhost:3000 on this device.', 'error');
    return;
  }

  try {
    // Request screen with audio
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor'
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 48000,
        autoGainControl: false
      }
    });

    shareBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');

    // Handle stream end (user clicked browser's stop button)
    localStream.getVideoTracks()[0].onended = () => {
      stopSharing();
    };

    setStatus('Sharing screen...', 'connected');

    // If a viewer is already waiting, send the offer now
    if (viewerPresent) {
      await createOffer();
    }
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setStatus('Screen sharing was cancelled');
    } else {
      setStatus('Failed to start screen sharing', 'error');
      console.error(err);
    }
  }
}

// Stop screen sharing
function stopSharing() {
  // Notify viewer before tearing down
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'sharing-stopped' }));
  }

  // Stop all tracks to dismiss the browser's screen sharing indicator
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  shareBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');

  closePeerConnection();
  setStatus('Stopped sharing');
}

// Create WebRTC offer
async function createOffer() {
  closePeerConnection();

  peerConnection = new RTCPeerConnection(iceServers);

  // Add tracks to connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

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
        setStatus('Connected to viewer! Streaming...', 'connected');
        break;
      case 'disconnected':
        setStatus('Viewer disconnected');
        break;
      case 'failed':
        setStatus('Connection failed', 'error');
        break;
    }
  };

  // Create and send offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  ws.send(JSON.stringify({
    type: 'offer',
    sdp: offer.sdp
  }));
}

// Handle answer from viewer
async function handleAnswer(message) {
  if (!peerConnection) return;

  const answer = new RTCSessionDescription({
    type: 'answer',
    sdp: message.sdp
  });

  await peerConnection.setRemoteDescription(answer);
}

// Handle ICE candidate from viewer
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
    // Remove all senders so tracks are fully released
    peerConnection.getSenders().forEach(sender => {
      try { peerConnection.removeTrack(sender); } catch (e) {}
    });
    peerConnection.close();
    peerConnection = null;
  }
}

// Update status display
function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status';
  if (type) {
    statusEl.classList.add(type);
  }
}

// Event listeners
shareBtn.addEventListener('click', startSharing);
stopBtn.addEventListener('click', stopSharing);

// Initialize on load
init();
