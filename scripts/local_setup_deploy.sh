#!/usr/bin/env bash
set -euo pipefail

KEY="$HOME/.ssh/do_deploy_ci"
echo "== CI SSH key setup script =="

if [ -f "$KEY" ]; then
  echo "Key already exists: $KEY"
else
  echo "Generating ed25519 key at $KEY (no passphrase)..."
  ssh-keygen -t ed25519 -C "github-deploy-ci" -f "$KEY" -N "" >/dev/null
fi

echo
echo "Public key (copy this to the server's /root/.ssh/authorized_keys):"
echo "--- BEGIN PUBKEY ---"
cat "${KEY}.pub"
echo "---  END PUBKEY  ---"

echo
echo "Next steps (run on your LOCAL machine):"
echo "1) Copy public key to droplet (you will be asked for droplet password once):"
echo "   ssh-copy-id -i ${KEY}.pub root@165.22.80.240"
echo
echo "2) Test SSH login using the new key:"
echo "   ssh -i ${KEY} root@165.22.80.240"
echo
if command -v gh >/dev/null 2>&1; then
  echo "gh CLI found — adding SSH_PRIVATE_KEY secret to the current repo (you may be prompted to authenticate)..."
  gh secret set SSH_PRIVATE_KEY --body "$(cat "$KEY")"
  echo "Secret SSH_PRIVATE_KEY created via gh."
else
  echo "gh CLI not found. Add the private key to GitHub Secrets manually:" 
  echo " - Open your repo → Settings → Secrets and variables → Actions → New repository secret"
  echo " - Name: SSH_PRIVATE_KEY"
  echo " - Value: paste the contents of $KEY"
fi

echo
echo "Optional: run remote deploy (pull + up) via the key (will run on the droplet):"
echo "   ssh -i ${KEY} root@165.22.80.240 \"cd /srv/yourapp && git pull || true && docker-compose pull && docker-compose up -d --remove-orphans\""

echo
echo "Script finished. If you want, run: chmod +x $PWD/scripts/local_setup_deploy.sh && $PWD/scripts/local_setup_deploy.sh"
