#!/bin/bash

###############################################
# 🔐 Encryption Setup Script
# Generate encryption keys and configure environment
###############################################

set -e  # Exit on error

echo "🔐 Encryption Configuration Setup"
echo "=================================="
echo ""

# 1. Generate ENCRYPTION_KEY (32 bytes = 64 hex chars)
echo "📝 Step 1: Generate ENCRYPTION_KEY"
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "✅ Generated: $ENCRYPTION_KEY"
echo ""

# 2. Generate JWT_SECRET (minimum 32 characters)
echo "📝 Step 2: Generate JWT_SECRET"
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "✅ Generated: $JWT_SECRET"
echo ""

# 3. Output environment variables
echo "📝 Step 3: Environment Variables to Set"
echo "=================================="
cat << EOF

Add these to your .env or deployment platform (GitHub Secrets, Railway, Render, etc.):

# Encryption (256-bit AES)
ENCRYPTION_KEY=$ENCRYPTION_KEY

# JWT Authentication
JWT_SECRET=$JWT_SECRET

# Database (change these)
DB_PASSWORD=<strong-password-here>
DB_HOST=<database-host>
DB_USER=<database-user>
DB_SSL=true

# Optional: New Relic APM
NEW_RELIC_LICENSE_KEY=<your-license-key>

EOF

echo ""
echo "⚠️  IMPORTANT:"
echo "1. Copy the above ENCRYPTION_KEY to your production environment"
echo "2. Store these values securely (GitHub Secrets, Vault, etc.)"
echo "3. NEVER commit these values to version control"
echo "4. Keep backups of ENCRYPTION_KEY for key rotation"
echo ""

echo "✅ Setup complete!"
echo ""
echo "To test encryption locally:"
echo "  ENCRYPTION_KEY=$ENCRYPTION_KEY npm test"
echo ""
