# Self-Hosted TURN Server Setup (coturn)

This guide explains how to set up your own TURN server for Hyperframe using coturn. This makes Hyperframe fully self-hosted and federated—no corporate dependencies.

## Why Self-Host TURN?

**STUN** (used for most P2P connections) is free and works ~80% of the time, but **TURN** (relay server) is needed when both peers are behind strict NATs or firewalls.

Self-hosting TURN means:
- ✅ Full control over your infrastructure
- ✅ No vendor lock-in (no Cloudflare, Twilio, etc.)
- ✅ Federated—anyone can run their own instance
- ✅ Free (except server costs)
- ✅ Privacy-friendly

## Prerequisites

- A VPS with a public IP (Hetzner, DigitalOcean, AWS, etc.)
- Ubuntu/Debian Linux
- Root/sudo access
- Ports 3478 and 5349 open in firewall

## Quick Setup

### 1. Run the automated setup script

```bash
sudo bash /var/www/hyperframe/setup-coturn.sh
```

The script will:
- Install coturn
- Generate a secure shared secret
- Configure the TURN server
- Open firewall ports
- Start the service

**Save the TURN_SECRET that's printed at the end!**

### 2. Add TURN secret to environment

Create or edit `.env` file in `/var/www/hyperframe/`:

```bash
# Self-hosted TURN server configuration
TURN_SECRET='your-generated-secret-here'
TURN_HOST='5.223.48.108'  # Your server's public IP
TURN_PORT='3478'
```

### 3. Restart Hyperframe

```bash
cd /var/www/hyperframe
pm2 restart hyperframe
```

### 4. Verify it's working

Check coturn is running:
```bash
sudo systemctl status coturn
```

Check ports are listening:
```bash
sudo netstat -tulpn | grep turnserver
```

You should see:
```
udp        0      0 0.0.0.0:3478            0.0.0.0:*                           12345/turnserver
tcp        0      0 0.0.0.0:3478            0.0.0.0:*           LISTEN          12345/turnserver
```

## Manual Configuration (Alternative)

If you prefer to configure manually instead of using the script:

### 1. Install coturn

```bash
sudo apt update
sudo apt install -y coturn
```

### 2. Generate a shared secret

```bash
openssl rand -hex 32
```

**Save this secret!** You'll use it in both coturn config and Hyperframe's `.env`.

### 3. Edit coturn configuration

```bash
sudo nano /etc/turnserver.conf
```

Add this configuration:

```
# Listening ports
listening-port=3478
tls-listening-port=5349

# Server IPs (replace with your actual IP)
listening-ip=0.0.0.0
relay-ip=YOUR_PUBLIC_IP_HERE
external-ip=YOUR_PUBLIC_IP_HERE

# Realm (your domain)
realm=hyperframe.computer
server-name=hyperframe.computer

# Authentication
use-auth-secret
static-auth-secret=YOUR_SECRET_HERE

# Security
fingerprint
lt-cred-mech

# Logging
verbose
log-file=/var/log/turnserver.log

# Performance
max-bps=1000000
user-quota=0
total-quota=0

# Safety
no-multicast-peers
no-loopback-peers
```

### 4. Enable coturn

Edit `/etc/default/coturn`:
```bash
sudo nano /etc/default/coturn
```

Uncomment or add:
```
TURNSERVER_ENABLED=1
```

### 5. Start coturn

```bash
sudo systemctl enable coturn
sudo systemctl start coturn
sudo systemctl status coturn
```

### 6. Open firewall ports

If using UFW:
```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp
```

## Testing TURN Server

### Test with trickle-ice tool

Visit: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

Add your TURN server:
- **TURN URI**: `turn:YOUR_IP:3478`
- **Username**: Get from Hyperframe logs (time-limited, format: `timestamp:hyperframe`)
- **Password**: Get from Hyperframe logs (HMAC-generated)

Click "Gather candidates" and look for `relay` type candidates.

### Check logs

```bash
sudo tail -f /var/log/turnserver.log
```

You should see connection attempts when testing WebRTC.

## How It Works

### Time-Limited Credentials

Hyperframe generates TURN credentials on-demand using HMAC-SHA1:

1. Client requests ICE servers from `/api/ice-servers`
2. Server generates username: `timestamp:hyperframe`
3. Server creates HMAC-SHA1 hash of username using shared secret
4. Credentials are valid for 24 hours
5. coturn verifies credentials using the same shared secret

This is more secure than static credentials and doesn't require a database.

### ICE Server Priority

Hyperframe provides this ICE server list to clients:

1. **STUN** (Google's public servers) - for NAT traversal
2. **TURN** (your self-hosted server) - for relay when STUN fails

WebRTC tries STUN first (free, P2P), then falls back to TURN if needed.

## Troubleshooting

### coturn won't start

Check logs:
```bash
sudo journalctl -u coturn -n 50
```

Common issues:
- Port already in use: `sudo netstat -tulpn | grep 3478`
- Invalid config: `sudo turnserver -c /etc/turnserver.conf --log-file=stdout`

### Firewall blocking

Verify ports are open:
```bash
sudo ufw status
```

Test externally with netcat:
```bash
nc -zv YOUR_IP 3478
```

### High bandwidth usage

coturn relays video/audio, so it uses bandwidth. Monitor with:
```bash
vnstat -l  # Real-time bandwidth
```

Consider:
- Limiting max bandwidth in turnserver.conf: `max-bps=500000` (500 kbps)
- Using per-user quotas: `user-quota=100` (100 sessions per user)

### Logs filling disk

Rotate logs:
```bash
sudo logrotate /etc/logrotate.d/coturn
```

Or disable verbose logging in `/etc/turnserver.conf`:
```
# verbose  # Comment this out
```

## Federated Setup

Anyone can fork Hyperframe and run their own instance with their own TURN server:

1. Clone Hyperframe
2. Set up coturn on their VPS
3. Configure `.env` with their TURN_SECRET
4. Deploy

Each instance is independent—no central server, no corporate dependency.

## Security Notes

- **Shared secret**: Keep this secret! Anyone with it can generate valid TURN credentials
- **Rate limiting**: coturn has built-in protections, but monitor for abuse
- **TLS**: Use port 5349 for encrypted TURN (requires SSL cert)
- **Realm**: Set to your domain to prevent credential sharing between services

## Cost Estimate

Running coturn on a small VPS:
- **Hetzner CX11**: €4/month (1vCPU, 2GB RAM, 20TB traffic)
- **DigitalOcean Basic**: $6/month
- **Bandwidth**: Most cloud providers include 1-20TB free

For a small Hyperframe instance, this is plenty.

## Alternative: STUN-Only

If you don't want to run TURN, Hyperframe works fine with STUN only:

1. Don't set `TURN_SECRET` in `.env`
2. Hyperframe falls back to Google's public STUN servers
3. ~80% of connections will work (those not behind strict NATs)

This is perfect for testing or low-traffic instances.

## Resources

- [coturn GitHub](https://github.com/coturn/coturn)
- [WebRTC TURN/STUN explained](https://webrtc.org/getting-started/turn-server)
- [coturn configuration examples](https://github.com/coturn/coturn/wiki/turnserver)

---

**Hyperframe: Screen sharing by the people, for the people.** 🚀
