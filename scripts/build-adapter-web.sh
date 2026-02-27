#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run build:web
rm -rf adapter/public
mkdir -p adapter/public
cp -R dist/. adapter/public/

echo "Adapter web assets updated in adapter/public"
