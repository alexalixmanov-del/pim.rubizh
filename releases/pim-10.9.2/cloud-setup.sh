#!/usr/bin/env bash
set -euo pipefail
repo_root=${PIM_REPO_ROOT:-/workspace/pim.rubizh}
# Preserve existing application files and use the current checkout.
if [[ ! -d "$repo_root/app" ]]; then
  mkdir -p "$repo_root"
  download_dir=$(mktemp -d /tmp/pim-cloud-setup-XXXXXX)
  trap 'rm -rf "$download_dir"' EXIT
  curl --fail --location --show-error --connect-timeout 20 --max-time 180 \
    'https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/ed76f21ac1fe048be029a72f114a20bc33824d9d/releases/pim-10.9.2/rubizh-pim-10.9.2.zip' \
    -o "$download_dir/release.zip"
  (cd "$download_dir" && printf '%s\n' '79192085e5af67f845de0e3599792a8e4b207d47a436ea8cbef71e6d48994934  release.zip' | sha256sum --check -)
  mkdir "$repo_root/app"
  unzip -q "$download_dir/release.zip" -d "$repo_root/app"
fi
cd "$repo_root/app"
npm ci --ignore-scripts --cache /workspace/.npm-cache
npm run build
npm test
