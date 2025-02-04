class WebRTCManager {
  constructor(subdomain) {
    this.subdomain = subdomain;
    this.socket = io(window.location.origin, {
      path: '/socket.io/',
      transports: ['websocket'],
      upgrade: false
    });
    this.peerConnection = null;
    this.stream = null;
    this.onStreamCallback = null;

    // Join the room for signaling
    this.socket.emit('join-room', this.subdomain);

    // Set up socket listeners
    this.setupSocketListeners();
  }

  setupSocketListeners() {
    this.socket.on('offer', async (data) => {
      await this.handleOffer(data.offer);
    });

    this.socket.on('answer', async (data) => {
      await this.handleAnswer(data.answer);
    });

    this.socket.on('ice-candidate', (data) => {
      this.handleIceCandidate(data.candidate);
    });
  }

  async initializePeerConnection() {
    const configuration = {
      iceServers: [
        { 
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun3.l.google.com:19302',
            'stun:stun4.l.google.com:19302'
          ]
        }
      ],
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          candidate: event.candidate,
          subdomain: this.subdomain
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      if (this.onStreamCallback) {
        this.onStreamCallback(event.streams[0]);
      }
    };

    // Add connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'failed') {
        this.reconnect();
      }
    };

    // Add ICE connection state monitoring
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.peerConnection.iceConnectionState);
    };
  }

  async reconnect() {
    console.log('Attempting to reconnect...');
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    await this.initializePeerConnection();
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.stream);
      });
    }
  }

  async startScreenShare() {
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      await this.initializePeerConnection();

      this.stream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.stream);
      });

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.socket.emit('offer', {
        offer: offer,
        subdomain: this.subdomain
      });
    } catch (error) {
      console.error('Error starting screen share:', error);
      throw error;
    }
  }

  async handleOffer(offer) {
    try {
      await this.initializePeerConnection();
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket.emit('answer', {
        answer: answer,
        subdomain: this.subdomain
      });
    } catch (error) {
      console.error('Error handling offer:', error);
      throw error;
    }
  }

  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
      throw error;
    }
  }

  async handleIceCandidate(candidate) {
    try {
      if (candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
      throw error;
    }
  }

  onStream(callback) {
    this.onStreamCallback = callback;
  }

  stopScreenShare() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    this.stream = null;
    this.peerConnection = null;
  }
} 