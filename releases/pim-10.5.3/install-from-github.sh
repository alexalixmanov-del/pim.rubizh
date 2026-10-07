#!/usr/bin/env bash
# Download and verify the prepared release, then use its tested hosting installer.
set -Eeuo pipefail
umask 077
target=${1:-/home/xk589064/rubizh.shop/pim}
for tool in curl unzip sha256sum mktemp bash; do
 command -v "$tool" >/dev/null || { echo "Не найдена команда: $tool" >&2; exit 1; }
done
[[ -d "$target" && -w "$target" ]] || { echo "Папка сайта не найдена или недоступна для записи: $target" >&2; exit 1; }
download_dir=$(mktemp -d /tmp/rubizh-pim-10.5.3-XXXXXX)
on_exit(){ status=$?; trap - EXIT; rm -rf "$download_dir"; if [[ "$status" != 0 ]]; then echo "Установка не завершена. Код ошибки: $status. См. сообщение выше." >&2; fi; exit "$status"; }
trap on_exit EXIT
archive="$download_dir/rubizh-pim-10.5.3.zip"
url='https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/90daca217b607e1c62683cdc222151c19600c78e/releases/pim-10.5.3/rubizh-pim-10.5.3.zip'
echo 'Скачиваю PIM 10.5.3 из GitHub...'
curl --fail --location --show-error --connect-timeout 20 --max-time 180 --retry 2 --output "$archive" "$url"
(cd "$download_dir" && printf '%s\n' '75456b54ec78d27ec104d4144e4ad8b73cbbcfef4b0f30f4259c96bbb3ac9b33  rubizh-pim-10.5.3.zip' | sha256sum --check -)
unzip -p "$archive" deploy-adm-tools.sh > "$download_dir/deploy.sh"
[[ -s "$download_dir/deploy.sh" ]] || { echo 'В архиве отсутствует установщик.' >&2; exit 1; }
echo 'Архив проверен. Сохраняю старую версию и устанавливаю обновление...'
bash "$download_dir/deploy.sh" "$archive" "$target"
