#!/usr/bin/env bash
set -euo pipefail

# Sync this project into the alexfeigin.github.io repo under the /text/ subdirectory.
#
# Usage:
#   ./deploy-to-pages-text.sh        # safe sync (no deletes)
#   ./deploy-to-pages-text.sh --delete  # mirror (deletes files in dest not present in source)

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/sources/alexfeigin.github.io/text"

DELETE_FLAG=""
if [[ "${1:-}" == "--delete" ]]; then
  DELETE_FLAG="--delete"
fi

mkdir -p "$DEST_DIR"

# We explicitly exclude dev/test artifacts.
rsync -av $DELETE_FLAG \
  --exclude ".git/" \
  --exclude ".idea/" \
  --exclude "node_modules/" \
  --exclude "tests/" \
  --exclude "test-output/" \
  --exclude "package-lock.json" \
  --exclude "package.json" \
  --exclude "app.js" \
  --exclude "result.png" \
  "$SRC_DIR/" \
  "$DEST_DIR/"

echo "Deployed to: $DEST_DIR"
