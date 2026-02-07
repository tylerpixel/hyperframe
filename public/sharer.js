// Sharer-side WebRTC and screen capture logic

const hyperframeCodeEl = document.getElementById('hyperframeCode');
const hyperframeUrlEl = document.getElementById('hyperframeUrl');
const shareBtn = document.getElementById('shareBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

let hyperframeCode = null;
let ws = null;
let peerConnection = null;
let localStream = null;
let viewerPresent = false;
let shareUrl = '';

// ICE servers for NAT traversal
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // TURN servers for relay when direct P2P fails
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

// Initialize: Get a hyperframe code
async function init() {
  console.log('Sharer page initializing...');
  try {
    console.log('Fetching hyperframe code...');
    const res = await fetch('/api/new-room');

    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const data = await res.json();

    if (!data.code) {
      throw new Error(data.error || 'No hyperframe code received');
    }

    hyperframeCode = data.code;

    hyperframeCodeEl.textContent = hyperframeCode;

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
      viewerUrl = `${protocol}//${host}/view/${hyperframeCode}`;
    } else if (isLocalhost) {
      // On localhost: use server-provided LAN IP for viewer
      viewerUrl = `http://${data.lanIP}:${data.port}/view/${hyperframeCode}`;
    } else {
      // Production: use subdomain
      const baseDomain = host.split('.').slice(-2).join('.');
      viewerUrl = `${protocol}//${hyperframeCode}.${baseDomain}`;
    }

    shareUrl = viewerUrl;
    hyperframeUrlEl.innerHTML = `Viewer URL: <a href="${viewerUrl}" target="_blank">${viewerUrl}</a>`;

    connectWebSocket();
  } catch (err) {
    setStatus('Failed to get hyperframe code', 'error');
    console.error(err);
  }
}

// Connect to signaling server
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  console.log('Connecting WebSocket as sharer for hyperframe:', hyperframeCode);
  ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected, joining hyperframe as sharer');
    ws.send(JSON.stringify({ type: 'join', room: hyperframeCode, role: 'sharer' }));
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    console.log('WebSocket message received:', message.type, message);

    switch (message.type) {
      case 'joined':
        setStatus('Waiting for viewer...');
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
    if (!peerConnection || peerConnection.connectionState !== 'connected') {
      setStatus('Disconnected from server', 'error');
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    if (!peerConnection || peerConnection.connectionState !== 'connected') {
      setStatus('Connection error', 'error');
    }
  };
}

// Start screen sharing
async function startSharing() {
  console.log('Share Screen button clicked');
  // Check if screen sharing is available (requires HTTPS or localhost)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setStatus('Screen sharing requires HTTPS. Use localhost:3000 on this device.', 'error');
    return;
  }

  console.log('Requesting screen share...');
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
    console.log('Adding track to peer connection:', track.kind, track.label);
    peerConnection.addTrack(track, localStream);
  });

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('ICE candidate generated:', event.candidate.candidate);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON()
        }));
        console.log('Sent ICE candidate to viewer');
      } else {
        console.error('Cannot send ICE candidate - WebSocket not open');
      }
    } else {
      console.log('ICE gathering complete');
    }
  };

  // ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', peerConnection.iceConnectionState);

    // Close WebSocket only after ICE connection is fully established
    if (peerConnection.iceConnectionState === 'connected' && ws && ws.readyState === WebSocket.OPEN) {
      console.log('ICE connected - safe to close WebSocket');
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
          ws = null;
        }
      }, 1000); // Wait 1 second to ensure stability
    }
  };

  // ICE gathering state changes
  peerConnection.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', peerConnection.iceGatheringState);
  };

  // Connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('Peer connection state:', peerConnection.connectionState);
    switch (peerConnection.connectionState) {
      case 'connected':
        setStatus('Connected to viewer! Streaming...', 'connected');
        console.log('Peer connection established, streaming video');
        break;
      case 'disconnected':
        setStatus('Viewer disconnected');
        break;
      case 'failed':
        setStatus('Connection failed', 'error');
        console.error('Peer connection failed');
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
  if (!peerConnection) {
    console.error('Received ICE candidate but no peer connection exists');
    return;
  }

  try {
    console.log('Received ICE candidate message:', message);
    console.log('Candidate object:', message.candidate);

    if (!message.candidate) {
      console.error('No candidate in message!');
      return;
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    console.log('Successfully added ICE candidate from viewer');
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

// Platform-aware copy hint
const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
const copyHintEl = document.getElementById('copyHint');
if (copyHintEl) copyHintEl.textContent = isMac ? '\u2318C' : 'Ctrl+C';

// Copy viewer URL on pill click
const hyperframeCodePill = document.getElementById('hyperframeCodePill');
if (hyperframeCodePill) {
  hyperframeCodePill.addEventListener('click', async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      if (copyHintEl) {
        copyHintEl.textContent = 'Copied!';
        setTimeout(() => {
          copyHintEl.textContent = isMac ? '\u2318C' : 'Ctrl+C';
        }, 2000);
      }
    } catch (err) {
      console.error('Copy failed:', err);
    }
  });
}

// Initialize on load
init();
