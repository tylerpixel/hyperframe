class HyperframeApp {
  constructor() {
    this.webrtcManager = null;
    this.subdomain = window.location.hostname.split('.')[0];
    this.init();
  }

  async init() {
    if (this.isValidSubdomain(this.subdomain)) {
      await this.checkExistingSession();
    } else {
      await this.createNewSession();
    }
  }

  isValidSubdomain(subdomain) {
    // Check if it's a valid two-word mnemonic subdomain
    return /^[a-z]+-[a-z]+$/.test(subdomain);
  }

  async createNewSession() {
    try {
      const response = await fetch('/api/session', {
        method: 'POST'
      });
      const data = await response.json();
      
      // Show the four-word mnemonic
      this.showMnemonic(data.sessionMnemonic);
      
      // Redirect to the new subdomain
      window.location.href = `https://${data.subdomain}.hyperframe.computer`;
    } catch (error) {
      console.error('Error creating session:', error);
      this.showError('Failed to create session');
    }
  }

  async checkExistingSession() {
    const mnemonic = localStorage.getItem(`mnemonic:${this.subdomain}`);
    
    if (mnemonic) {
      // This is the host, initialize WebRTC
      this.initializeHost(mnemonic);
    } else {
      // This is a joining peer, show mnemonic input
      this.showMnemonicInput();
    }
  }

  async initializeHost(mnemonic) {
    this.webrtcManager = new WebRTCManager(this.subdomain);
    
    // Show the screen sharing UI
    this.showHostUI();
    
    // Handle stream display
    this.webrtcManager.onStream(stream => {
      const videoElement = document.getElementById('remoteVideo');
      videoElement.srcObject = stream;
    });
  }

  async joinSession(mnemonic) {
    try {
      const response = await fetch('/api/session/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subdomain: this.subdomain,
          mnemonic: mnemonic
        })
      });

      if (response.ok) {
        this.webrtcManager = new WebRTCManager(this.subdomain);
        this.showGuestUI();
        
        // Handle stream display
        this.webrtcManager.onStream(stream => {
          const videoElement = document.getElementById('remoteVideo');
          videoElement.srcObject = stream;
        });
      } else {
        this.showError('Invalid mnemonic code');
      }
    } catch (error) {
      console.error('Error joining session:', error);
      this.showError('Failed to join session');
    }
  }

  // UI Methods
  showMnemonic(mnemonic) {
    const container = document.querySelector('.container');
    container.innerHTML = `
      <div class="boilerplate">
        <div class="terminal">Your session code is:</div>
        <div class="description">${mnemonic}</div>
      </div>
      <div class="follow">Share this code with your guest</div>
    `;
    
    // Store mnemonic for this subdomain
    localStorage.setItem(`mnemonic:${this.subdomain}`, mnemonic);
  }

  showMnemonicInput() {
    const container = document.querySelector('.container');
    container.innerHTML = `
      <div class="boilerplate">
        <div class="terminal">Enter session code:</div>
        <div class="description">
          <input type="text" id="mnemonicInput" placeholder="four-word-session-code">
        </div>
      </div>
      <button id="joinButton" class="follow">Join Session</button>
    `;

    document.getElementById('joinButton').addEventListener('click', () => {
      const mnemonic = document.getElementById('mnemonicInput').value;
      this.joinSession(mnemonic);
    });
  }

  showHostUI() {
    const container = document.querySelector('.container');
    container.innerHTML = `
      <div class="boilerplate">
        <div class="terminal">Ready to share screen</div>
        <div class="description">
          <button id="shareButton">Start Sharing</button>
          <video id="remoteVideo" autoplay playsinline></video>
        </div>
      </div>
    `;

    document.getElementById('shareButton').addEventListener('click', () => {
      this.webrtcManager.startScreenShare().catch(error => {
        console.error('Screen sharing error:', error);
        this.showError('Failed to start screen sharing');
      });
    });
  }

  showGuestUI() {
    const container = document.querySelector('.container');
    container.innerHTML = `
      <div class="boilerplate">
        <div class="terminal">Connected to session</div>
        <div class="description">
          <video id="remoteVideo" autoplay playsinline></video>
        </div>
      </div>
    `;
  }

  showError(message) {
    const container = document.querySelector('.container');
    container.innerHTML += `
      <div class="error">${message}</div>
    `;
  }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new HyperframeApp();
}); 