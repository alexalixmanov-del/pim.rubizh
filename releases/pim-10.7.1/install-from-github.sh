#!/usr/bin/env bash
# Download and verify the prepared release, then use its tested hosting installer.
set -Eeuo pipefail
umask 077
target=${1:-/home/xk589064/rubizh.shop/pim}
for tool in curl unzip sha256sum mktemp bash; do
 command -v "$tool" >/dev/null || { echo "Не найдена команда: $tool" >&2; exit 1; }
done
[[ -d "$target" && -w "$target" ]] || { echo "Папка сайта не найдена или недоступна для записи: $target" >&2; exit 1; }
download_dir=$(mktemp -d /tmp/rubizh-pim-10.7.1-XXXXXX)
on_exit(){ status=$?; trap - EXIT; rm -rf "$download_dir"; if [[ "$status" != 0 ]]; then echo "Установка не завершена. Код ошибки: $status. См. сообщение выше." >&2; fi; exit "$status"; }
trap on_exit EXIT
archive="$download_dir/rubizh-pim-10.7.1.zip"
url='https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/167c56656786b42652fe9285a540e936e90d549c/releases/pim-10.7.1/rubizh-pim-10.7.1.zip'
echo 'Скачиваю PIM 10.7.1 из GitHub...'
curl --fail --location --show-error --connect-timeout 20 --max-time 180 --retry 2 --output "$archive" "$url"
(cd "$download_dir" && printf '%s\n' '3a5b7d24fb24ebf3eed03fe18b40cf8fb729e76e1805b3dc029662fe1429c34e  rubizh-pim-10.7.1.zip' | sha256sum --check -)
unzip -p "$archive" deploy-adm-tools.sh > "$download_dir/deploy.sh"
[[ -s "$download_dir/deploy.sh" ]] || { echo 'В архиве отсутствует установщик.' >&2; exit 1; }
echo 'Архив проверен. Сохраняю старую версию и устанавливаю обновление...'
bash "$download_dir/deploy.sh" "$archive" "$target"
