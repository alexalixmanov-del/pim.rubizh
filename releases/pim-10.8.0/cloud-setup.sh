#!/usr/bin/env bash
set -euo pipefail
repo_root=${PIM_REPO_ROOT:-/workspace/pim.rubizh}
# Preserve existing application files and use the current checkout.
if [[ ! -d "$repo_root/app" ]]; then
  mkdir -p "$repo_root"
  download_dir=$(mktemp -d /tmp/pim-cloud-setup-XXXXXX)
  trap 'rm -rf "$download_dir"' EXIT
  curl --fail --location --show-error --connect-timeout 20 --max-time 180 \
    'https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/5d63473baebacd1826da77d2b702de8001531afb/releases/pim-10.8.0/rubizh-pim-10.8.0.zip' \
    -o "$download_dir/release.zip"
  (cd "$download_dir" && printf '%s\n' '9794075f41297652c30610b8e471af1d176725dadcaa09c0518a8c778166f003  release.zip' | sha256sum --check -)
  mkdir "$repo_root/app"
  unzip -q "$download_dir/release.zip" -d "$repo_root/app"
fi
cd "$repo_root/app"
npm ci --ignore-scripts --cache /workspace/.npm-cache
npm run build
npm test
