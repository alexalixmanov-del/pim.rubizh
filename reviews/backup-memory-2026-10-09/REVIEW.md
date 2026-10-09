# PIM 10.9.3 — blocker: падение Chrome до скачивания полного backup

Повторная установка принятой сборки `f85fe54697b12ddb20b0e0cb6bd0eda41c5a65e8` остановлена. Владелец подтвердил: после нажатия apply не появился ни скачанный backup, ни диалог продолжения. В принятом коде запись основной миграции расположена после обоих действий; до неё выполнение не дошло. Возможно создание промежуточной записи в отдельной backup DB; это не применение миграции каталога. Данные поверх текущей базы не восстанавливались.

Read-only HTTP-проверка подтверждает прежний index.html PIM 10.9.0, SHA256 `9ad5e483465ce1e1878bf433d50ee5ae9606e60be4cfcacac64a559db27d64ef`. Проверены публичные байты index, не текущий IndexedDB владельца и не весь набор rollback-файлов. Статус попытки: **FAILED / CODE ROLLBACK OBSERVED / MAIN DATA MIGRATION NOT REACHED**. Новая сборка ниже только для review, deployment не запускался.

## Причина и границы исправления

Полный production snapshot включает raw KV, localStorage, документы и автоматические backup blobs. Прежние тесты использовали полный portable JSON, но не дополнительную историю автоматических копий реального IndexedDB. Старый encoder/decoder создавал несколько больших JSON/base64 строк одновременно; глубокие native structuredClone и сравнение всего каталога добавляли копии текстов и пиковую память.

На том же предоставленном источнике, дополненном 14 gzip blobs полного каталога, Chromium с V8 old-space limit 768 MiB воспроизводит падение принятого f85fe54 **после preview, до backup download**. Это отдельное подтверждение, не предположение о точном количестве/содержимом backup blobs на устройстве владельца. Фикстура намеренно тяжёлая: 14 полных копий исходного JSON, а не реальные файлы его истории. Источник — принятая предоставленная копия 10.9.0 от 09.10, at=1791508886500; SHA256 файла `6311d34d9f89f5ba1066cb925883213a765cb1f57febab29357d869cc7c7792a`.

Исправлены только обнаруженные блокеры памяти/интерфейса:

- Encoder отдаёт JSON и base64 порциями; gzip формируется потоком без монолитной JSON-строки. Reader разбирает записи и отдельные бинарные payload, проверяя их SHA256; не хранит все транспортные base64 строки после восстановления Blob.
- FORMAT/version остаются v1. Физический JSON содержит прежние rows/local_storage/metadata/binaries и дополнительный `streaming_json:1`. Старый компактный v1 и portable JSON читаются; новый файл также проверен прежним JSON decoder API. Возвращаемая новым потоковым reader таблица binaries содержит SHA256, а проверенные байты находятся в rows.Blob — транспортные строки не удерживаются.
- SHA256 вычисляется инкрементально. Digest rows совпадает с прежним SHA256(rowText), что проверено независимым node:crypto, включая Unicode, порядок полей и Blob metadata.
- Копируются изменяемые JSON-контейнеры без повторной сериализации неизменяемых строк; Native Blob/Date/typed values сохраняют native clone. Контроль сохранности и readback сравнивают каждый полный товар по ID; ни одно поле из проверок не исключено.
- Чтение KV идёт cursor в одной readonly transaction. CAS проверяет каждую строку/количество в **одной readwrite transaction** и записывает только после совпадения; stale/abort по-прежнему не дают частичного применения. Никакого дробления атомарной migration на частично записанные партии.
- Pending migration не строит скрытый экран публикации. После применения/загрузки прежний read-only per-product cache готовится короткими порциями с прогрессом; assessment, data-version и minute invalidation не меняются. Повторное нажатие apply во время backup блокируется.
- Те же потоковые backup/checksum/readback используются в standalone recovery. Обязательные скачивание, подтверждение владельца, полный backup и rollback сохранены.

Из 15 runtime files изменены только `index.html`, `release-recovery.html`, `lib/release-storage.js`. Остальные 12 совпадают побайтно с f85fe54, включая категории, size/inventory/model rules, schemas и vendor. Установщик не изменён. Принятый ui-recovery.zip не перезаписан. Никаких новых business rules, перепривязки suppliers, публикации, скрытия, архивации или включения feeds/sync.

## Проверка исправленной сборки

Реальный Chromium: полный HTML/bootstrap без замены runtime логики; loopback origin, настоящая IndexedDB, native кнопки preview/apply, download и confirmation. Тестовые обёртки только измеряют время вызовов. Все внешние API запрещены; изображения/шрифты/stylesheet замоканы. Это не проверка настоящей авторизации Supabase, магазина или всех удалённых фотографий.

Полный путь прошёл: preview → сохранение/чтение полного backup → скачивание → подтверждение → atomic apply → persisted readback; поиск, товары, категории, поставщики, backup, settings, import при ширине 1440/390; перезагрузка; второй идентичный apply без записи/нового backup; rollback с rescue copy. SHA256 всех 14 автоматических backup blobs до/после apply/rollback совпадают. Console/page/network ошибок и renderer crash нет.

Сборка устраняет воспроизведённое падение, но не обещает мгновенную обработку на любом устройстве. В последнем ограниченном тесте максимальный JS long task — 2.121 s; итоговый render публикации — 0.787 s вместо 11.634 s в промежуточном тесте без прогрева. Максимальная задержка таймера — 10.607 s; сюда попадают весь путь backup/storage/confirmation/GC, точная причина этой отдельной задержки не установлена. Максимальный instrumented usedJSHeapSize — 826 MiB (это не точный RSS/old-space, включает другие учитываемые V8 allocations). Полные измерения сохранены в browser-report.json. Безошибочный проход с искусственным лимитом не заменяет smoke-check браузера владельца.

Контроль на предоставленной копии, дополнительно с независимыми полными protected/prices hashes:

| Invariant | Результат |
|---|---:|
| PRODUCTS | 3113 |
| SKU / VARIANTS | 8734 |
| CATEGORIES | 143 |
| MANUAL_LOCK_PRODUCTS | 8 |
| LOST_CATEGORIES / SKU / VARIANTS / PHOTOS / PRICES / STOCK | 0 для каждого |
| DUPLICATE_SKU / SIZE_OPTIONS / EXCEPTIONS CREATED | 0 для каждого |
| SECOND_IDENTICAL_MIGRATION_WRITES / NEW_BACKUPS | 0 / 0 |
| ROLLBACK / RESCUE BACKUP | PASS / PASS |
| SYNC_ENABLED / AUTOPRICES_ENABLED | false / false |
| PRODUCTION_WRITES / PRODUCTION_API_CALLS | 0 / 0 |

Protected hash до/после и после rollback: `eb1fdbb9b6792e7eb6c0df610e9c78007175472783ad3eb4708d9ba441551a61`. Calculated price hash до/после: `5c97c92e9df0ba8541629130cbeac424b0a31f03cbf86bb3a69487d607f7122c`.

Неизменённые runtime результаты: категории SAFE_AUTO=2712 / LIKELY=194 / AMBIGUOUS=207; size SAFE_AUTO=7709 / LIKELY=1 / AMBIGUOUS=1024; exact SKU sizes=4262; allowed sizes without SKU=1141; SIZE_CONFIRMATION_REQUIRED=1604. Количества по поставщикам: IN_STOCK=6187, OUT_OF_STOCK=1034, PREORDER=1, UNKNOWN=1512 (Tactical Belt); PAYMENT_READY=4563. UNKNOWN numeric quantity=8734 не означает UNKNOWN availability: принятые STATUS policies сохранены.

617 обязательных Node tests, 49 size/business tests и 12 installer tests прошли. Проверены stale source/другая вкладка, отмена backup/confirmation, повреждение checksum, отказ/abort транзакции, неудачный readback и автоматический rollback, повторный apply-click. Package повторно собран в другой путь: SHA256 совпал; проверены checksums каждого manifest file и неизменность 12 runtime files.

## Артефакты и воспроизведение

- `migration-control.json`: безопасный отчёт на предоставленной копии; приватный backup и пути к нему не публикуются.
- `browser-report.json`: полный браузерный тест с 14 дополнительными blobs.
- `frozen-renderer-crash.json`: ожидаемое падение принятого f85fe54.
- `rollback-http.json`: независимая проверка публичного index после остановки.
- `release-summary.json`: allowlist, hashes и проверки архива.
- `../../releases/pim-10.9.3/rubizh-pim-10.9.3-backup-memory.zip`: отдельный исправленный архив.

```sh
npm --prefix app test
npm --prefix app run test:dry-run
PIM_TEST_ARCHIVE="$PWD/releases/pim-10.9.3/rubizh-pim-10.9.3-backup-memory.zip" python3 app/tests/production-installer.test.py
PIM_SOURCE=/absolute/private/approved-backup.json \
PIM_PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
PIM_CHROMIUM=/usr/bin/chromium \
PIM_BROWSER_REPORT=/absolute/private/browser-report.json \
node --max-old-space-size=6144 reviews/backup-memory-2026-10-09/browser-smoke.cjs
```

Для frozen воспроизведения сначала проверить SHA принятого ui-recovery.zip по release-summary исходного review, извлечь его в отдельный временный каталог и скопировать index.html в rubizh_pim.html. Установить PIM_APP=/absolute/frozen/app и PIM_FROZEN=1; использовать тот же источник/Chromium/лимит. Ожидаемый результат EXPECTED_RENDERER_CRASH отличается от PASS исправленного runtime. Это не установка на хостинг.

## Повторный deployment

До GO на новый commit этот архив не устанавливать. Старое согласование было на точную f85fe54 сборку. Повторно проверить исходный профиль, pending=0, 3113/8734 и совпадение с проверенной копией (canonical live core SHA `314ac851e26a75dbf5d70becba8256f3dd4a00ac1f6e5c31982c7b6c5338f261`). При отличии нужен новый полный источник и preview. Не очищать IndexedDB и не восстанавливать данные поверх непроверенной базы.

Сохранить полный актуальный pre-deployment backup и текущие runtime files вне webroot. После разрешённой установки проверить HTTP checksums/загрузку; затем preview и все invariants в исходном профиле. Применять только после реального download и подтверждения. После apply — reload/counts/no-op и отсутствие console/network ошибок; любое отличие — data rollback проверенной копией, затем code rollback. Сохранённый предыдущий installer rollback остаётся доступен. Tactical Belt UNKNOWN, новый /pim/sync contract и autoprices выключены; никаких массовых действий каталога.
