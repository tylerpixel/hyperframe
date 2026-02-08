#!/bin/bash
# Coturn setup script for Hyperframe
# Run with: sudo bash setup-coturn.sh

set -e

echo "=== Installing coturn ==="
apt update
apt install -y coturn

echo ""
echo "=== Generating secure shared secret ==="
TURN_SECRET=$(openssl rand -hex 32)
echo "Generated TURN secret: $TURN_SECRET"

echo ""
echo "=== Configuring coturn ==="
cat > /etc/turnserver.conf <<EOF
# Coturn configuration for Hyperframe
# Self-hosted TURN server for WebRTC relay

# Listening ports
listening-port=3478
tls-listening-port=5349

# Server IPs (replace with your server's public IP)
listening-ip=0.0.0.0
relay-ip=5.223.48.108
external-ip=5.223.48.108

# Realm (your domain)
realm=hyperframe.computer
server-name=hyperframe.computer

# Authentication
use-auth-secret
static-auth-secret=$TURN_SECRET

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

# Relay addresses allowed
no-multicast-peers
no-loopback-peers

# Enable for debugging (comment out in production)
# log-binding

EOF

echo ""
echo "=== Enabling coturn service ==="
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

echo ""
echo "=== Starting coturn ==="
systemctl enable coturn
systemctl restart coturn

echo ""
echo "=== Checking coturn status ==="
systemctl status coturn --no-pager || true

echo ""
echo "=== Opening firewall ports (if UFW is enabled) ==="
if command -v ufw &> /dev/null; then
    ufw allow 3478/tcp
    ufw allow 3478/udp
    ufw allow 5349/tcp
    ufw allow 5349/udp
    echo "Firewall rules added"
else
    echo "UFW not installed, skipping firewall configuration"
fi

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "TURN Server Configuration:"
echo "  Host: 5.223.48.108"
echo "  Port: 3478 (UDP/TCP)"
echo "  TLS Port: 5349 (TCP)"
echo "  Secret: $TURN_SECRET"
echo ""
echo "Save this secret! You'll need it for Hyperframe configuration."
echo "Add to your .env file:"
echo "  TURN_SECRET='$TURN_SECRET'"
echo ""
echo "Test with: netstat -tulpn | grep turnserver"