#!/usr/bin/env bash
set -euo pipefail
repo_root=${PIM_REPO_ROOT:-/workspace/pim.rubizh}
# Preserve existing application files and use the current checkout.
if [[ ! -d "$repo_root/app" ]]; then
  mkdir -p "$repo_root"
  download_dir=$(mktemp -d /tmp/pim-cloud-setup-XXXXXX)
  trap 'rm -rf "$download_dir"' EXIT
  curl --fail --location --show-error --connect-timeout 20 --max-time 180 \
    'https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/46a39c8a6a726ac7ce64ecec3599315ac8a65d0e/releases/pim-10.9.0/rubizh-pim-10.9.0.zip' \
    -o "$download_dir/release.zip"
  (cd "$download_dir" && printf '%s\n' '9b3a2b89dc001057ca9efe142f370db2af74bad05b745cce3077e6fc07a275cd  release.zip' | sha256sum --check -)
  mkdir "$repo_root/app"
  unzip -q "$download_dir/release.zip" -d "$repo_root/app"
fi
cd "$repo_root/app"
npm ci --ignore-scripts --cache /workspace/.npm-cache
npm run build
npm test
