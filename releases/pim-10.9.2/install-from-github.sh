#!/usr/bin/env bash
# Download and verify the prepared release, then use its tested hosting installer.
set -Eeuo pipefail
umask 077
target=${1:-/home/xk589064/rubizh.shop/pim}
for tool in curl unzip sha256sum mktemp bash; do
 command -v "$tool" >/dev/null || { echo "Не найдена команда: $tool" >&2; exit 1; }
done
[[ -d "$target" && -w "$target" ]] || { echo "Папка сайта не найдена или недоступна для записи: $target" >&2; exit 1; }
download_dir=$(mktemp -d /tmp/rubizh-pim-10.9.2-XXXXXX)
on_exit(){ status=$?; trap - EXIT; rm -rf "$download_dir"; if [[ "$status" != 0 ]]; then echo "Установка не завершена. Код ошибки: $status. См. сообщение выше." >&2; fi; exit "$status"; }
trap on_exit EXIT
archive="$download_dir/rubizh-pim-10.9.2.zip"
url='https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/ed76f21ac1fe048be029a72f114a20bc33824d9d/releases/pim-10.9.2/rubizh-pim-10.9.2.zip'
echo 'Скачиваю PIM 10.9.2 из GitHub...'
curl --fail --location --show-error --connect-timeout 20 --max-time 180 --retry 2 --output "$archive" "$url"
(cd "$download_dir" && printf '%s\n' '79192085e5af67f845de0e3599792a8e4b207d47a436ea8cbef71e6d48994934  rubizh-pim-10.9.2.zip' | sha256sum --check -)
unzip -p "$archive" deploy-adm-tools.sh > "$download_dir/deploy.sh"
[[ -s "$download_dir/deploy.sh" ]] || { echo 'В архиве отсутствует установщик.' >&2; exit 1; }
echo 'Архив проверен. Сохраняю старую версию и устанавливаю обновление...'
bash "$download_dir/deploy.sh" "$archive" "$target"
