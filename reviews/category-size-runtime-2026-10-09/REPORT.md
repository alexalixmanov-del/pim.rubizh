# Контрольная интеграция категорий и размеров — 10.9.3 REVIEW

Принятый план: `c0d18f58803992ef7e59a8c037eb0f38a9da96a9`. Реализация выполнена в review-ветке `review/category-size-integration-2026-10-09`. Это применённая **контрольная копия**, production не изменён. Сборка блокирует сеть и `/pim/sync`, использует отдельный IndexedDB namespace и не запускает автоматическую публикацию, скрытие или архивирование.

## Что проверено

На копии из 3 113 товаров / 8 734 реальных вариантов выполнены штатные `doImport()` → preview → `applyImport()`, включая backup, IndexedDB persist и чтение сохранённого результата. Затем тот же источник импортирован второй раз. Все пять поставщиков прошли оба импорта.

**Оригинальных XLS/XLSX нет.** Полный источник — явно обозначенный `RECONSTRUCTED_FROZEN_OFFER_REPLAY`: строки восстановлены из сохранённых supplier bindings с исходными именами, descriptions, attributes и raw provenance. Это не выдаётся за проверку оригинальных таблиц. Обычные новые строки, dedicated columns, arbitrary mapped headers и отсутствие Cartesian size × color проверены отдельными runtime integration fixtures.

Приватный кандидат сохранён вне Git. Архив не содержит базу товаров, цены поставщиков, backup или installer. Исходный snapshot не перезаписан.

## Обязательные показатели

```text
CATEGORIES = 143
LOST_CATEGORIES = 0
LOST_SKU = 0
LOST_VARIANTS = 0
LOST_PHOTOS = 0
LOST_PRICES = 0
LOST_STOCK = 0
DUPLICATE_SKU_CREATED = 0
DUPLICATE_SIZE_OPTIONS_CREATED = 0
DUPLICATE_EXCEPTIONS_CREATED = 0
PRODUCTION_WRITES = 0
```

Сохранность проверена по каждой связи product → variant SKU → supplier ID/SKU, фото, закупочным/RRP/расчётным ценам, stock, времени наблюдения stock, publication flags и manual fields. Хэши защищённых данных до/после совпали; отдельно совпали рассчитанные цены. Все исходные 134 taxonomy objects сохранены без изменения names, parents, IDs и aliases; supplier mapping dictionary не изменён. Добавлены только 9 утверждённых IDs.

## Runtime confidence

| Объект классификации | SAFE_AUTO | LIKELY | AMBIGUOUS |
|---|---:|---:|---:|
| Категории: товары | 2711 | 194 | 204 |
| Размеры: реальные варианты | 7866 | 1 | 867 |

Ещё 4 существующих архивных redirect/alias-записи без variants/supplier rows оставлены нетронутыми. Категорийные числа относятся ко всей базе, а не прежней очереди из 316. Отдельная сверка исходных 124 воспроизвела принятые **109 SAFE_AUTO / 12 LIKELY / 3 AMBIGUOUS**, включая те же SAFE category IDs. EARMOR/MaxDefense и спорные комплекты не закрыты принудительно.

SAFE size evidence может подтверждать ассортимент модели, не подтверждая конкретный SKU. Поэтому SAFE_AUTO нельзя отождествлять с размером, готовым к оформлению заказа.

| Размеры и остатки | Количество |
|---|---:|
| EXACT_SIZE: точные SKU → size | 4199 |
| allowed_sizes без реального SKU | 1145 |
| SIZE_CONFIRMATION_REQUIRED: реальные варианты | 1446 |
| SIZE_CONFIRMATION_REQUIRED: отдельные size options | 1145 |
| UNKNOWN stock: реальные варианты | 8734 |
| UNKNOWN stock: отдельные size options | 1145 |
| NO_SIZE_REQUIRED | 3068 |
| ONE_SIZE, подтверждённый источником | 21 |
| Модельные size catalogs | 268 |
| Развёрнутые диапазоны | 119 |

Старые численные остатки сохранены в supplier data; повторный импорт не сделал их свежими. Никакого inferred PREORDER или срока изготовления. `UNKNOWN` не разрешает подтверждённый checkout. Общие ranges/options остаются MODEL-scoped: они не доказывают наличие размера для каждого цвета.

**Manual locks: 8 товаров сохранены**, hash до/после одинаков. Variant locks в исходной копии: 0; конфликтующие variant/manual/catalog locks дополнительно проверены fixtures.

Очередь: 1846 конкретных исключений сгруппированы в **148 групп** — 64 категорийных и 84 размерных. Group key включает supplier + canonical category + rule/pattern. LIKELY/AMBIGUOUS сохраняют подтверждённые значения; повторный импорт не плодит исключения. Групповое подтверждение нового правила не запускается автоматически.

## Второй идентичный импорт

Создано SKU: **0**. Создано дублирующих options/exception IDs: **0**. Нормализованные категории, size catalogs, sizes/status, source binding statuses, category/size evidence, fingerprints и exception state совпали полностью:

```text
first_normalized_sha256  = dda55f9d14a85ebe09ec08e42e60bcbc8056921cfe544dc3725222bfabe63c2d
second_normalized_sha256 = dda55f9d14a85ebe09ec08e42e60bcbc8056921cfe544dc3725222bfabe63c2d
```

Операционные logs/imported_at могут отражать второй запуск; они не обновляют stock_observed_at. Исправлена legacy-подмена: вычисленный размер больше не становится новым исходным native-size доказательством при replay. Изменение сильной исходной колонки размера инвалидирует cache и пересчитывает результат.

## Реализованный pipeline и export

- Browser/CommonJS category resolver воспроизводит принятый evidence resolver; canonical JSON + 25 новых aliases + 13 CONDITIONAL supplier rules версионированы. Старые mappings/manual locks приоритетнее автоматики.
- Raw dedicated size и supplier/variant provenance сохраняются до inference. Dedicated column сильнее SKU inference, title, attrs и description. Supplier-specific комбинированные форматы сохранены.
- Один supplier row не разворачивается в fake размеры/SKU или size × color. Range/list создаёт отдельный `size_catalogs[].allowed_sizes`; реальные `variants` сохраняют прежние SKU, suppliers, фото, цены и stock.
- `classification-ui.inc.js` управляет SAFE patches, cache invalidation, grouped exceptions и review boundaries; pipeline выполняется при новых импортах. Preview fingerprints защищают apply от изменившихся данных/правил.
- `classificationExport()`, `buildFeed()`, SIMPLE payload и выбор цветов/размеров используют нормализованные данные. Public export исключает private supplier bindings. MODEL → COLOR → SIZE/SKU и галереи цветов сохранены.
- `contracts/category-size-export.schema.json` проверяет структуру; schema запрещает tradable size options с fake SKU/stock. Отсутствие usable photos исключает товар из локального export, не меняя publication/archive flags; описание восстанавливается только из фактических supplier attributes.
- FNV fingerprint ускорен с сохранением прежних hash values. Сборка/архив воспроизводимы.

## Rollback / abort

Прошли runtime fixtures: отмена preview возвращает исходные данные; изменённый raw source вызывает STALE_PREVIEW; failed persist возвращает pre-import backup; failed persisted verification откатывает classification/stock. Проверены также запрет сетевых запросов, startup auto-merge/SKU repair, automatic pricing changes и publication/archive policy в review.

**515 тестов приложения + 49 размеров + 78 принятых категорий = 642, failures 0.** Проверены также `npm ci`, build и все 515 тестов из чистой копии staged-файлов; hash HTML совпал. Логи сохранены рядом; audit выполнялся на том же собранном HTML, который помещён в архив.

## Что нужно для дальнейшего этапа

| Задача | Конкретные отсутствующие данные/файлы |
|---|---|
| Приём нормализованных товаров магазином | Файлы маршрутизации/контроллеров реальных `/pim/sync` и `/pim/status`; обработчик импортируемого payload; схемы/миграции product, model, color, variant, SKU и stock tables. Их точные пути в репозитории магазина нужно указать; в этой PIM их нет. |
| Цвета, фото и sizes на витрине | Файл компонента/шаблона карточки товара с color/size selector и галереей; слой загрузки product/variant API, чтобы подключить новый schema и исключить range parsing на сайте. |
| Заявки под заказ / подтверждение размера | Endpoint создания заявки, модель/таблица заявки, форма подтверждения и источник явного supplier preorder/term. Без explicit field нельзя обещать изготовление. |
| Проверка checkout и комплектов | Контроллер создания заказа, server-side price/availability validation, транзакционная stock reservation и release, validator состава/количества kit components, схемы order/order_items/reservations. |
| End-to-end проверка | Отдельный staging URL, тестовый product/SKU/color, тестовый путь checkout и доступ к журналу тестового заказа. Production для этой проверки не нужен. |
| Автопрайсы | Постоянная CSV/XLSX/XML ссылка отдельно для «м вин», «тактикал белт», «укр тек», «киборг», «армолайн»; исходный sample-файл каждого поставщика, названия колонок SKU/model/color/exact size/stock и явные preorder/lead-time поля, время обновления и confirmed supplier format rules. |

Исходные прайсы/остатки оставлены для проверки; их актуальные ссылки нужны перед запуском. `app/server/fetch-supplier-feeds.py` — локальный сборщик, он не является отсутствующим checkout или `/pim/sync` магазина.

## Review-артефакт

Архив: [rubizh-pim-10.9.3-review.zip](rubizh-pim-10.9.3-review.zip). Он запускается локально; подробности в `app/README.md`. После распаковки: `python3 -m http.server 8765`, открыть `http://localhost:8765/rubizh_pim.html`, восстановить backup только в этой тестовой копии. Приватный backup не размещать в HTTP-каталоге.

Runtime SHA256: `9a1bbe697074008118c3d2b6f8f0ff1e30eb6f5cdb22000ae156aa4c546d981f`.

Archive SHA256: `e358dc37b43be738de14760912aecf00663e98eecce02849b189fc3bcbd5ecad`.

Пример публичного нормализованного export: [export-sample.json](export-sample.json), проверен JSON schema.

Контрольные данные: [control-import.json](control-import.json), [acceptance-crosscheck.json](acceptance-crosscheck.json), [exceptions.json](exceptions.json), [manifest.json](manifest.json). Production deployment и массовая публикация не выполнялись.
