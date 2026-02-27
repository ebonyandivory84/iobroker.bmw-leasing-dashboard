#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <raspi-user@raspi-host> [remote-web-root]"
  echo "Example: $0 pi@192.168.44.31 /var/www/bmw-leasing-dashboard"
  exit 1
fi

TARGET="$1"
REMOTE_ROOT="${2:-/var/www/bmw-leasing-dashboard}"

echo "Building web bundle..."
npm run build:web

echo "Creating remote directory: ${REMOTE_ROOT}"
ssh "$TARGET" "sudo mkdir -p '$REMOTE_ROOT' && sudo chown -R \$(whoami) '$REMOTE_ROOT'"

echo "Syncing dist/ to Raspberry..."
rsync -avz --delete dist/ "${TARGET}:${REMOTE_ROOT}/"

echo "Copying Caddyfile template to home directory on Raspberry..."
scp deploy/Caddyfile "${TARGET}:~/Caddyfile.bmw-leasing-dashboard"

cat <<EOF
Done.

Next on Raspberry:
1) sudo apt update && sudo apt install -y caddy
2) sudo cp ~/Caddyfile.bmw-leasing-dashboard /etc/caddy/Caddyfile
3) sudo systemctl reload caddy

Then open:
http://<raspi-ip>/
EOF
