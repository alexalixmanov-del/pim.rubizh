#!/usr/bin/env bash
# Install only public runtime files. Backups are kept outside the website directory.
set -Eeuo pipefail
umask 077
archive=${1:?Usage: bash deploy-adm-tools.sh archive.zip [website-directory]}
target=${2:-/home/xk589064/rubizh.shop/pim}
for tool in unzip mktemp cp mv chmod sha256sum realpath cmp grep; do command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }; done
archive=$(realpath "$archive")
target=$(realpath "$target")
[[ -f "$archive" && -d "$target" && -w "$target" ]] || { echo 'Archive or writable website directory is missing.' >&2; exit 1; }
# Resolve the account directory for this hosting layout. Override only for local staging tests.
backup_root=${PIM_BACKUP_ROOT:-/home/xk589064/.pim-deploy-backups}
[[ "$backup_root" != "$target" && "$backup_root" != "$target/"* ]] || { echo 'Backup directory must be outside the website.' >&2; exit 1; }
mkdir -p "$backup_root"
chmod 700 "$backup_root"
backup=$(mktemp -d "$backup_root/10.10.0-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
stage="$backup/stage"
mkdir "$stage" "$backup/previous"
files=(rubizh_pim.html lib/kits.js lib/categories.js lib/product-model.js lib/model-contract-v2.js lib/ui.css vendor/xlsx-0.20.3.min.js vendor/LICENSE np-origins.json index.html)
unzip -q "$archive" "${files[@]}" SHA256SUMS -d "$stage"
for file in "${files[@]}"; do
 [[ -f "$stage/$file" && ! -L "$stage/$file" ]] || { echo "Missing release file: $file" >&2; exit 1; }
 [[ ! -L "$target/$file" ]] || { echo "Refusing to replace a symbolic link: $file" >&2; exit 1; }
 parent=$(dirname "$file")
 [[ "$parent" == '.' || ! -L "$target/$parent" ]] || { echo "Refusing symbolic-link directory: $parent" >&2; exit 1; }
 done
[[ -f "$stage/SHA256SUMS" && ! -L "$stage/SHA256SUMS" ]] || exit 1
grep -q 'const PIM_VERSION = "10.10.0"' "$stage/rubizh_pim.html" || { echo 'Wrong PIM version in archive.' >&2; exit 1; }
(cd "$stage" && sha256sum -c SHA256SUMS)
: > "$backup/previous-files"
: > "$backup/new-files"
for file in "${files[@]}"; do
 if [[ -e "$target/$file" ]]; then
  [[ -f "$target/$file" ]] || { echo "Existing path is not a regular file: $file" >&2; exit 1; }
  mkdir -p "$backup/previous/$(dirname "$file")"
  cp -p "$target/$file" "$backup/previous/$file"
  printf '%s\n' "$file" >> "$backup/previous-files"
 else printf '%s\n' "$file" >> "$backup/new-files"; fi
 done
{
 printf '#!/usr/bin/env bash\nset -Eeuo pipefail\ntarget=%q\nbackup=%q\n' "$target" "$backup"
 cat <<'ROLLBACK'
while IFS= read -r file; do
 mkdir -p "$target/$(dirname "$file")"
 tmp=$(mktemp "$target/$(dirname "$file")/.pim-rollback-XXXXXX")
 cp -p "$backup/previous/$file" "$tmp"
 mv -f "$tmp" "$target/$file"
done < "$backup/previous-files"
while IFS= read -r file; do rm -f "$target/$file"; done < "$backup/new-files"
echo "Previous PIM files restored in $target"
ROLLBACK
} > "$backup/rollback.sh"
chmod 700 "$backup/rollback.sh"
installing=false
tmp=''
on_error(){ status=$?; trap - ERR INT TERM; [[ -z "$tmp" ]] || rm -f "$tmp"; if "$installing"; then bash "$backup/rollback.sh" || echo "Rollback failed. Backup: $backup" >&2; fi; exit "$status"; }
trap on_error ERR
trap 'false' INT TERM
cp "$archive" "$backup/release.zip"
installing=true
for file in "${files[@]}"; do
 parent="$target/$(dirname "$file")"
 if [[ ! -d "$parent" ]]; then mkdir -p "$parent"; chmod 755 "$parent"; fi
 tmp=$(mktemp "$parent/.pim-release-XXXXXX")
 cp "$stage/$file" "$tmp"
 chmod 644 "$tmp"
 mv -f "$tmp" "$target/$file"
 tmp=''
 done
(cd "$target" && sha256sum -c "$stage/SHA256SUMS")
installing=false
trap - ERR INT TERM
# An uploaded release contains source and audit files: remove it from the public directory.
if [[ "$archive" == "$target/"* ]]; then rm -f "$archive"; fi
rm -rf "$stage"
echo 'PIM 10.10.0 installed. Browser catalog remains on the same site origin.'
printf 'Backup: %s\nRollback: bash %q\n' "$backup" "$backup/rollback.sh"
echo 'Reload https://pim.rubizh.shop/ with Ctrl+F5 and check the version and catalog.'
