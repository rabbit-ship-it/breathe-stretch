#!/usr/bin/env bash
# zip-build.sh — packages the extension for upload to the Chrome Web Store.
# Run from the project root: ./zip-build.sh
# Output: breathe-and-stretch-<version>.zip

set -euo pipefail

VERSION=$(python3 -c "import json,sys; print(json.load(open('manifest.json'))['version'])")
OUT="breathe-and-stretch-${VERSION}.zip"

# Remove any previous build of the same name
rm -f "$OUT"

zip -r "$OUT" . \
  --exclude "*.git*" \
  --exclude "*node_modules*" \
  --exclude "*.DS_Store" \
  --exclude "*.claude*" \
  --exclude "generate_icons.py" \
  --exclude "zip-build.sh" \
  --exclude "breathe-and-stretch-*.zip"

echo "Created: $OUT  ($(du -sh "$OUT" | cut -f1))"
