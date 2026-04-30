#!/usr/bin/env sh

set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUTPUT_PATH="${1:-$ROOT_DIR/artifacts/glassmoocs-source.zip}"
TMP_DIR=$(mktemp -d)
STAGE_DIR="$TMP_DIR/source"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM

mkdir -p "$STAGE_DIR" "$(dirname "$OUTPUT_PATH")"

copy_path() {
  src="$1"
  dest_dir=$(dirname "$src")
  mkdir -p "$STAGE_DIR/$dest_dir"
  cp -R "$ROOT_DIR/$src" "$STAGE_DIR/$src"
}

copy_path package.json
copy_path pnpm-lock.yaml
copy_path vite.config.js
copy_path eslint.config.js
copy_path prettier.config.mjs
copy_path options.html
copy_path README.md
copy_path public
copy_path src

rm -f "$OUTPUT_PATH"
(cd "$STAGE_DIR" && zip -qr "$OUTPUT_PATH" .)
