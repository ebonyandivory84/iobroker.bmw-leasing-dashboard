#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run build:web
TARGET_PUBLIC_DIR="$ROOT_DIR/../public"
rm -rf "$TARGET_PUBLIC_DIR"
mkdir -p "$TARGET_PUBLIC_DIR"
cp -R dist/. "$TARGET_PUBLIC_DIR"/

echo "Adapter web assets updated in $TARGET_PUBLIC_DIR"
