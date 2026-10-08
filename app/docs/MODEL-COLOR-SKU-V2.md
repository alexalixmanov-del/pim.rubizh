# PIM MODEL → COLOR → SKU, контракт 2.0

Основа: `deploy/pim-10.5.2-terminal`, commit `b9efcc9b3a50d3a5dd36d92b7d34cf868c66a9e6`, проверенный архив 10.9.0 SIMPLE (SHA-256 `9b3a2b89dc001057ca9efe142f370db2af74bad05b745cce3077e6fc07a275cd`). Исторический ZIP не менялся. Исходники вынесены в `app/`; версия новой сборки — 10.10.0, пока для проверки миграции.

Это реализация структуры и экспорта в PIM. Объединение live карточек, применение новой схемы на магазине и новый kit engine сюда не входят. Их запуск требует успешной сверки фактических данных. Старый PHP магазин не получает новый формат автоматически.

## Хранение и идентичность

`cfg.model_registry_v2` сохраняется в IndexedDB, проверяется чтением после записи и включается в резервные копии. В нём независимые `models`, `colors`, `product_mappings`, `variant_mappings`, `photo_mappings`. `schema_version = "2.0"`.

Исходные PRODUCT записи не удаляются и не перемещаются: остаются неизменным архивом источника, включая ручные поля, варианты, предложения поставщиков и исходные фото. Авторитетная структура v2 определяется только registry. Похожие названия, описания, цветовые слова и совпавшие размеры не подтверждают принадлежность модели.

Автоматическое объединение `mcPlan().automatic` выключено, в том числе при последующих импортах. Старые явно вызываемые ручные операции 10.9 оставлены для совместимости, но не являются инструментом миграции v2. После сохранения registry v2 отправка через старый `/pim/sync` блокируется, чтобы он не разложил модель обратно на старые карточки.

У модели: `model_id`, `marketing_name_uk`, `brand`, `canonical_category_id`, `description`, `slug`, `size_policy`, `publication_status`, `mapping_status`, `attributes`. У цвета: независимый устойчивый `color_id`, `model_id`, отдельные `color` и `camouflage`. У SKU: устойчивый `variant_id`, неизменный `sku`, `size:{raw,normalized}`. Цена, остаток и все supplier links берутся из снимка источника, а не из editable mapping.

Начальный draft создаёт отдельный UNKNOWN model для каждой исходной записи; он не является классификацией или подтверждённой группировкой. SKU сохраняются в quarantine `unmapped_variants` до подтверждения, поэтому отсутствие подтверждения не равнозначно потере данных. ID, подтверждённые ранее, нельзя менять следующей загрузкой registry.

Цвета не выводятся из названия. Каждая строка variant mapping подтверждает точные `legacy_product_id`, `legacy_variant_id` (null, если неизвестен), `legacy_sku`, `model_id`, `color_id`, `variant_id`, `sku`. Нулевой или отсутствующий старый ID не выдумывается. В существующей MySQL таблице вариантов первичный ключ — SKU; отдельный `variant_id` дополнительно берётся из фактических данных сайта, когда он есть.

Фото имеет явный mapping. UNKNOWN обязательно означает `color_id:null`. Оно остаётся в `unassigned_photos`, не попадает в публичную галерею и не заменяется общей галереей модели. Идентичность исходного фото включает источник, URL и номер повторения, поэтому перестановка фото не меняет ID, а подмена URL не наследует подтверждение старого изображения.

## Экспорт

Приватный bundle: `schema_version`, `models[] → colors[] → photos[] / variants[]`, `legacy_mapping`, полный `source_archive`, `categories`, `taxonomy_state`, `report`. Формальная схема — [model-contract-v2.schema.json](model-contract-v2.schema.json). Дополнительная семантическая проверка выполняется `lib/model-contract-v2.js`.

`legacy_mapping` содержит отдельные `product_mappings`, `variant_mappings`, `photo_mappings`. Product mapping указывает старый URL и точный redirect URL; неизвестный URL блокирует миграцию. Для многоцветной старой карточки redirect ведёт на модель без произвольного цвета. `color` в query содержит стабильный `color_id`, не текстовое имя цвета.

Приватный экспорт содержит поставщиков, закупку и архив raw-данных. Его нельзя публиковать. `publicExport()` использует allowlist, исключает supplier links, costs, raw/archive/unknown photos и произвольные административные attributes; при заблокированном отчёте возвращает пустой каталог. Полный public API storefront реализуется следующим этапом.

## Состояния

- `IN_STOCK`: подтверждённый положительный количественный остаток, не stale.
- `PREORDER`: явное подтверждение и положительный срок.
- `ORDER_ON_REQUEST`: разрешённая владельцем заявка; срок остаётся null.
- `SIZE_CONFIRMATION_REQUIRED`: размер требует уточнения.
- `OUT_OF_STOCK`: недоступный SKU.
- `HIDDEN`: не публикуемый SKU; архив сохраняется.

`stock:null` отличается от 0. Raw размер сохраняется отдельно; отсутствующий обязательный размер нельзя превратить в «один размер». Повтор двух SKU одного цвета с одинаковым normalized размером требует решения в PIM и блокирует экспорт; SKU не схлопываются по цвету и размеру. Неизвестная доступность сохраняется как `availability_unknown:true` и не публикуется.

## Dry-run и taxonomy

Миграция требует одновременно: все `LOST_* = 0`, нет ошибок, нет неподтверждённых model/product/SKU mappings, подтверждены старые URL. UNKNOWN фото допустимы как сохранённый архив; опубликованный цвет требует отдельной подтверждённой галереи.

Проверяются SKU/ID, фото, цены, остатки, supplier lineage, категории, группировочные блокировки, уникальность slug/redirect, достаточность размера и семантика availability. Published модель без описания или цвет без фото/SKU блокируются. Внешние redirects и опасные схемы photo URL отклоняются. Проверка не скачивает и не доказывает фактическую пригодность каждой картинки: на стороне магазина остаётся проверка файлов и image processing до публикации.

Справочники PIM и сайта различаются: в baseline PIM 134 ID; файл taxonomy текущего репозитория сайта содержит 136 активных ID. Старые пути и названия не являются crosswalk. Не переименовывать IDs по похожим названиям; требуются фактические связи/aliases/locks/decisions из сайта.

## Browser workflow

1. Открыть «Якість і дані товарів» → «MODEL → COLOR → SKU».
2. Экспортировать текущий source и UNKNOWN draft mapping.
3. На основе подтверждённой reclassification и фактического site snapshot определить модели/цвета, каждый SKU, фото и старые URLs. Сейчас редактор принимает registry JSON; полноценный визуальный редактор группировок ещё не реализован.
4. Загрузить mapping, запустить dry-run, сохранить registry. Перед записью создаётся safety backup, после записи проверяется IndexedDB.
5. Полный приватный и публичный export разрешены только после успешной проверки. Rollback возвращает registry, сохраняя более поздние обновления цен и предложений.

Offline CLI (полная копия анализируется изолированно, ключи cfg в экспорт не включаются):

```sh
node --max-old-space-size=2048 tools/audit-backup-v2.cjs \
  --backup /private/backup.json --output-dir /private/new-audit-directory
node --max-old-space-size=2048 tools/model-v2-dry-run.cjs \
  --source /private/source.json --mapping /private/mapping.json \
  --output /private/new-report-directory
node --max-old-space-size=2048 tools/reconcile-site-v2.cjs \
  --pim-source /private/source.json --site-source /private/site.json \
  --output /private/new-reconciliation.json
```

Файлы создаются вне web root, директории 0700, файлы 0600, существующие отчёты не перезаписываются. CLI dry-run: exit 0 — прошёл; 2 — blocked; 1 — ошибка чтения/вывода. Reconciliation никогда сам не разрешает миграцию.

## Необязательный PIM-side API

`server/model-v2-server.cjs` — Node 22+ сервис, отдельно от PHP магазина. Требуются `PIM_DATA_DIR` вне web root и приватный `PIM_API_TOKEN` от 32 символов. Слушает только loopback; открывать порт в Интернет нельзя. Production размещение требует отдельного защищённого reverse proxy/TLS и проверки доступности Node на выбранном хостинге. Никакая новая услуга пока не подключалась.

Все запросы требуют bearer; cookies не используются, browser Origin отвергается. На диске единый атомарный state, fsync и предыдущая копия; единственный writer защищён lock file. Перезапуск читает подтверждённое состояние. После аварийного завершения stale lock удаляется только после проверки отсутствия живого процесса. Это PIM admin workflow, не доказательство устойчивости магазина к 10 000 покупателям.

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/pim/status` | revision и source SHA-256 |
| POST | `/api/pim/catalog-snapshots` | полный source + `base_revision` |
| GET | `/api/pim/export/models` | последний подтверждённый bundle |
| GET | `/api/pim/export/legacy-mapping` | последний подтверждённый mapping |
| POST | `/api/pim/publish-batches` | `batch_id`, `base_revision`, `source_sha256`, `registry`, `request_hash` |
| GET | `/api/pim/publish-batches/{batch_id}` | сохранённый результат |

Hash запроса: SHA-256 от canonical JSON `{base_revision,source_sha256,registry}` с рекурсивной сортировкой ключей, порядок массивов сохраняется. Повтор того же batch ID и hash возвращает прежний ACK независимо от уже изменившейся revision. Другой hash с тем же ID — 409. Два разных конкурентных batch на одну revision: один commit, второй 409. Batch атомарный, без частичного ACK. Новый source не может удалить ранее сохранённые SKU/фото/категории; source change инвалидирует подготовленный экспорт. Новые source записи нужно сохранять вместе с историческим архивом.

`READY_FOR_SITE` означает «PIM подготовила данные», а не «магазин применил пакет». `site_modified:false`, `site_connected:false`. CREATE/UPDATE/HIDE/REPUBLISH и `/api/site/pim/batches` реализуются в магазине после утверждения mapping. Старый live PHP магазин пока не поддерживает эти endpoints.

## Проверка предоставленного каталога

Копия `rubizh-pim-backup-2026-10-04-17-42.json`: 3 113 записей, 8 734 SKU, 82 328 ссылок на фото (включая повторные ссылки из карточек/вариантов/предложений), SHA-256 `eb3604fd349bc062a920127649beb6f9d52d4ab5335040a993487ae8978bc5be`.

Все ссылки сохранены, LOST_SKU/VARIANTS/PHOTOS/PRICES/STOCK/CANONICAL_CATEGORIES/SUPPLIER_LINKS = 0. В копии нет canonical IDs, legacy URLs, старых variant IDs и подтверждённой MODEL grouping. Поэтому UNKNOWN draft **заблокирован для миграции**. Нулевой LOST_CANONICAL_CATEGORIES не доказывает правильную категоризацию: исходных canonical IDs нет.

Read-only сверка публичного live каталога 08.10: 2 226 видимых карточек, 7 079 SKU. С копией совпали 3 608 SKU и их product owners; цены/остатки совпавших SKU не различаются. 3 471 site SKU отсутствуют в старой копии, 5 126 PIM SKU не представлены в публичном каталоге. Причины неизвестны без полного site snapshot; это не объявляется потерей или основанием удалить товары. Публичный каталог не включает hidden записи и не является consistent DB snapshot.

Приватные `/api/pim/status` и `/api/pim/categories` вернули HTTP 500; главная и публичный catalog API — HTTP 200. Поэтому для закрытых данных подготовлена CLI выгрузка из БД:

```sh
/usr/local/php82/bin/php -d memory_limit=512M /tmp/rubizh-export-site-source.php \
  --site-root=/home/xk589064/rubizh.shop/www
```

Сначала на сервер должен быть доставлен `tools/export-site-source.php` из этой проверенной сборки. Он не вызывает `db()`/migrations, работает в READ ONLY consistent snapshot и выгружает только whitelist каталожных таблиц; customer/account/order/payment/credentials таблицы не читаются. Выходной файл вне public www. Подготовить закрытую ссылку для передачи этой выгрузки; после неё продолжить reconciliation и reclassification, а не объединять live карточки сейчас.

CLI протестирован на локально восстановленной прежней БД: 2 457 карточек / 7 336 SKU / 15 037 фото. Это проверка инструмента, не текущая production выгрузка.

## Проверки кода

486/486 тестов прошли без skips: исходные проверки PIM и новые проверки explicit mapping, quarantine, приватности, rollback, конкурирующих batch/retry/restart и полной синтетической миграции 10 000 моделей / 20 000 SKU. Экспорт синтетического подтверждённого каталога валиден по JSON Schema 2020-12. Эти результаты не отменяют блокировки mapping реального каталога.


## Проверяемая сборка и установка в staging

```sh
python3 tools/package.py --output-dir /absolute/outside-app/review
```

Пакет включает публичный runtime, исходники, контракт, CLI-инструменты и синтетические тесты. Полные backup/source/mapping, ключи и node_modules исключены явным списком путей. RELEASE.json и SHA256SUMS генерируются заново для версии 10.10.0; исторические релизы не изменяются.

Скрипт deploy-adm-tools.sh распаковывает только разрешённые runtime-файлы и проверяет их SHA-256, включая новый lib/model-contract-v2.js. Локальная установка на копию старого runtime и полный откат проверены: предыдущие байты восстановлены, добавленный файл удалён. Проверена стартовая страница с перенаправлением на rubizh_pim.html и загрузкой контракта без JS-ошибок. Это не установка на live hosting.
