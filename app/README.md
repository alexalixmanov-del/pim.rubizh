# РУБІЖ PIM 10.9.3 REVIEW

Сборка только для локальной проверки категорий и размеров. Не устанавливать на live/production.

143 canonical categories, принятые evidence rules, SAFE_AUTO и сгруппированные исключения, отдельные модельные size_catalogs и реальные SKU. Сеть и `/pim/sync` заблокированы; импорты не публикуют, не скрывают и не архивируют товары. IndexedDB и серверные настройки используют отдельный namespace.

Откройте каталог через `python3 -m http.server 8765`, затем `http://localhost:8765/rubizh_pim.html`. Каталог товаров не включён: восстановите свою резервную копию через интерфейс на этой тестовой копии. Production-данные браузера не читаются и не меняются. Не размещайте приватный backup в каталоге HTTP-сервера.

Разработка: `npm ci --cache /tmp/rubizh-npm-cache`, `npm run build`, `npm test`, `npm run test:dry-run`. Контрольный импорт: из корня репозитория `node --max-old-space-size=6144 audit/category-size-control-import.cjs /absolute/path/private-backup.json /absolute/path/report-dir`. Тесты используют isolated browser runtime и IndexedDB; оригинальные XLS/XLSX отсутствуют, поэтому полный контроль использует явно обозначенный replay сохранённых supplier bindings. Новые колонки и строки проверяются отдельными integration fixtures.

`contracts/category-size-export.schema.json` задаёт нормализованный формат. `buildFeed()` даёт только локальный review export: UNKNOWN и SIZE_CONFIRMATION_REQUIRED нельзя оформлять как подтверждённый заказ. Финальные counts и результаты двух импортов находятся в `reviews/category-size-runtime-2026-10-09/` в репозитории.

Старые документы и deployment-скрипты в исходном пакете исторические; эта сборка не является production-релизом и не содержит installer.
