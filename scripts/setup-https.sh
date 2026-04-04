#!/bin/bash
# Quick HTTPS Setup for DigitalOcean Droplet
# This script installs Certbot, gets Let's Encrypt certs, and configures Nginx

set -e

echo "🔒 Setting up HTTPS with Let's Encrypt and Nginx..."

# 1. Install Nginx and Certbot
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Create Nginx config for HTTP-only (for ACME challenge)
cat > /tmp/nginx-http-only.conf << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name zackpro.codes 46.101.209.56;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }
}
EOF

# 3. Enable Nginx config temporarily (just for port 80)
sudo cp /tmp/nginx-http-only.conf /etc/nginx/sites-available/quiz-platform
sudo ln -sf /etc/nginx/sites-available/quiz-platform /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 4. Start Nginx
sudo systemctl restart nginx

# 5. Get Let's Encrypt certificate for zackpro.codes
# Replace your-email@example.com with a real email
echo "📧 Enter your email for Let's Encrypt notifications (or press Enter to skip):"
read -r EMAIL

if [ -z "$EMAIL" ]; then
    EMAIL="certbot@zackpro.codes"
fi

# Get the certificate (this will handle ACME challenge automatically)
sudo certbot certonly \
    --nginx \
    -d zackpro.codes \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --redirect

echo "✅ Certificate obtained! Location: /etc/letsencrypt/live/zackpro.codes/"
echo ""
echo "📋 Next steps:"
echo "1. Update your docker-compose.yml to use the production version with Nginx"
echo "2. Update the Nginx config with the new certificate paths"
echo "3. Restart docker-compose"
echo ""
echo "Certificate paths:"
echo "  - fullchain.pem: /etc/letsencrypt/live/zackpro.codes/fullchain.pem"
echo "  - privkey.pem: /etc/letsencrypt/live/zackpro.codes/privkey.pem"
echo "  - Auto-renewal: Enabled (your system will renew before expiration)"
