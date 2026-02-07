# Deployment Guide

Hyperframe requires a persistent Node.js server with WebSocket support. **Vercel is not compatible.**

Deployed on **Antares** (Hetzner VPS).

---

## Hetzner VPS Deployment

### Prerequisites

**DNS Configuration (Cloudflare):**

1. **Get your Antares IP address** (from Hetzner dashboard or SSH)

2. **In Cloudflare DNS settings, add:**
   - `A` record: `hyperframe.computer` → `your-antares-ip` (Proxied ☁️ ON - orange cloud)
   - `A` record: `*.hyperframe.computer` → `your-antares-ip` (Proxied ☁️ ON - orange cloud)

3. **Set Cloudflare SSL/TLS mode:**
   - Go to SSL/TLS → Overview
   - Set to **"Full (strict)"**
   - This requires a valid SSL cert on Antares (step 7 below)

4. **Verify WebSocket support (should be enabled by default):**
   - Go to Network → WebSockets
   - Ensure "WebSockets" is ON

**Why Proxied ON?**
- Free SSL from Cloudflare to browser
- DDoS protection
- CDN for static assets
- WebSockets work fine with Cloudflare proxy (tested with WebRTC signaling)

**If you have WebSocket issues:** Switch both A records to "DNS only" (gray cloud) in Cloudflare

### Setup Steps

**1. SSH into your Hetzner VPS:**
```bash
ssh root@your.vps.ip.address
```

**2. Install Node.js (if not installed):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v  # Should show v20+
```

**3. Clone and setup app:**
```bash
cd /var/www
git clone https://github.com/tylerpixel/hyperframe.git
cd hyperframe
npm install
```

**4. Install PM2 (process manager):**
```bash
npm install -g pm2
pm2 start server.js --name hyperframe
pm2 save                    # Save process list
pm2 startup                 # Auto-start on reboot (follow instructions)
```

**5. Install nginx as reverse proxy:**
```bash
apt-get install -y nginx
```

**6. Configure nginx for Hyperframe:**
Create `/etc/nginx/sites-available/hyperframe`:
```nginx
# Catch wildcard subdomains (*.hyperframe.computer) and main domain
server {
    listen 80;
    server_name hyperframe.computer *.hyperframe.computer;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout settings for long-lived connections
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/hyperframe /etc/nginx/sites-enabled/
nginx -t                    # Test config
systemctl reload nginx
```

**7. Setup SSL with Let's Encrypt:**

**Note:** Even with Cloudflare's SSL, you MUST install a cert on Antares for Cloudflare's "Full (strict)" mode to work.

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d hyperframe.computer -d *.hyperframe.computer
```

Follow prompts:
- Enter email for renewal notices
- Agree to Terms of Service
- Select option 2: "Redirect HTTP to HTTPS"

**Important:** For wildcard certs (`*.hyperframe.computer`), certbot may require DNS validation. If so:
```bash
# Use DNS challenge instead
certbot certonly --manual --preferred-challenges dns -d hyperframe.computer -d *.hyperframe.computer
```
Certbot will give you a TXT record to add to Cloudflare DNS temporarily. After adding it, wait 1-2 minutes, then press Enter in certbot.

Then manually update nginx to use the certs:
```nginx
# In /etc/nginx/sites-available/hyperframe, update the server block:
server {
    listen 443 ssl;
    server_name hyperframe.computer *.hyperframe.computer;

    ssl_certificate /etc/letsencrypt/live/hyperframe.computer/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hyperframe.computer/privkey.pem;

    # ... rest of config from step 6
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name hyperframe.computer *.hyperframe.computer;
    return 301 https://$host$request_uri;
}
```

Reload nginx:
```bash
systemctl reload nginx
```

**8. Deploy updates:**
```bash
cd /var/www/hyperframe
git pull origin main:prod
npm install                 # If dependencies changed
pm2 restart hyperframe
```

---

## Testing After Deployment

- Main page: `https://hyperframe.computer`
- Room subdomain: `https://maple-storm.hyperframe.computer`

## Monitoring

```bash
# Check app status
pm2 status

# View logs
pm2 logs hyperframe

# Monitor in real-time
pm2 monit
```
