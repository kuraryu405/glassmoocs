#!/bin/bash
# INIAD Glassmorphism ビルドスクリプト

set -e

echo "Building iniad-glassmorphism.xpi..."

# XPIファイルを作成
zip -r iniad-glassmorphism.xpi manifest.json content.js styles.css

echo "Build complete: iniad-glassmorphism.xpi"
