#!/usr/bin/env bash
set -euo pipefail
repo_root=${PIM_REPO_ROOT:-/workspace/pim.rubizh}
# Preserve existing application files and use the current checkout.
if [[ ! -d "$repo_root/app" ]]; then
  mkdir -p "$repo_root"
  download_dir=$(mktemp -d /tmp/pim-cloud-setup-XXXXXX)
  trap 'rm -rf "$download_dir"' EXIT
  curl --fail --location --show-error --connect-timeout 20 --max-time 180 \
    'https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/167c56656786b42652fe9285a540e936e90d549c/releases/pim-10.7.1/rubizh-pim-10.7.1.zip' \
    -o "$download_dir/release.zip"
  (cd "$download_dir" && printf '%s\n' '3a5b7d24fb24ebf3eed03fe18b40cf8fb729e76e1805b3dc029662fe1429c34e  release.zip' | sha256sum --check -)
  mkdir "$repo_root/app"
  unzip -q "$download_dir/release.zip" -d "$repo_root/app"
fi
cd "$repo_root/app"
npm ci --ignore-scripts --cache /workspace/.npm-cache
npm run build
npm test
