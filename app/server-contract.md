# Review contract: categories + sizes, v2

This review build does not connect to the shop, call `/pim/sync`, or publish/archive/hide products. It uses its own IndexedDB namespace. The candidate catalog and supplier bindings stay local.

## Capabilities for a future shop integration

The shop must acknowledge `category_catalog_version: 2`, the exact 143 canonical IDs, and `size_catalog_version: 1` before any release can send this format. Existing category IDs, names and parents are retained; the nine approved additions are in `categories/canonical-categories.json`. The accompanying `contracts/category-size-export.schema.json` validates normalized products. Unknown IDs must be rejected, never mapped silently.

`MODEL → COLOR → SIZE/SKU`: colors have stable IDs and their own galleries. Each real variant retains its existing PIM SKU and supplier bindings. Public export excludes supplier bindings and raw source evidence. Authenticated fulfillment export includes original supplier IDs/SKUs; they must not be sent to the public storefront.

`size_catalogs` is model/color assortment evidence, not inventory. `size_options` without a real variant have `variant_sku: null`, `supplier_sku: null`, `stock: null`, `stock_status: UNKNOWN`, `availability: SIZE_CONFIRMATION_REQUIRED`, `checkout_allowed: false`. A MODEL-scoped option does not prove availability for every color. The storefront only displays these normalized options; it must not parse or expand source ranges.

Only a confirmed SKU-size binding and fresh positive stock can be `IN_STOCK`. Zero is `OUT_OF_STOCK`. Stale or unconfirmed inventory is `UNKNOWN`; missing required size is `SIZE_CONFIRMATION_REQUIRED`. `PREORDER` requires independent explicit supplier confirmation. A missing production term stays null: no automatic three-day promise. These statuses are uppercase in the v2 export.

Checkout must revalidate the selected model ID, color ID, real SKU, size, source binding, current price and inventory on the server. UNKNOWN and SIZE_CONFIRMATION_REQUIRED can create a confirmation request, never a paid confirmed order or stock reservation. Confirmed preorder uses a separate request/order path and a supplier-confirmed term when available. Stock reservations must be atomic, including quantities of components of kits.

Products with zero usable photos are excluded from the export; this review run does not execute hide/archive commands. Missing description can be restored from factual supplier attributes, without inventing material, certification, protection rating, compatibility or contents.

## Remaining shop inputs

Actual endpoints, database schema and checkout source are absent. Before server implementation provide the repository and paths for `/pim/sync`, `/pim/status`, product/variant/stock tables or migrations, storefront product selector/gallery, checkout creation, stock reservation and kit validation. Read-only staging URL and a test product/order are needed for end-to-end validation. Supplier feed URLs are not configured; provide a stable CSV/XLSX/XML URL and sample column definitions per supplier, including per-size SKU/stock and explicit preorder/lead-time fields. Never send credentials in report or source files.

---

Previous contract (historical context only; superseded rules are not current behavior):

# Что ожидает PIM от API магазина

Исходники магазина не предоставлены; серверная совместимость, оформление заказа и резервирование остатков ещё не проверены. Приложение на хостинге было доступно для чтения 6 октября и имеет версию 10.1.3. Упоминания PHP/MySQL и config.php в исторических материалах архива не заменяют проверку действующего сервера.

`POST /pim/sync`, Authorization: Bearer <согласованный ключ>. Пакет до 150 товаров. `products` содержит RUB-SKU, цены продажи, доступность, фото и признаки рекламы; закупка и документы в публичный каталог не входят. В закрытом API у вариантов есть `fulfillment_supplier_id`, `fulfillment_supplier_sku`, `fulfillment_origin`. Результат должен содержать `results`: ровно одну запись `{id,status}` на каждый отправленный товар; статусы `created`, `updated`, `unchanged`, `error` (с `error`). Неизвестный ID, повтор ID, неизвестный статус или неполный ответ считаются ошибкой. Пример:

```json
{"ok":true,"results":[{"id":"p-example","status":"updated"}],"hidden":0,"photos_pending":0}
```

`settings`: hide_unavailable, category_filters, kit_role_categories. Первый пакет передаёт категории при изменениях. Последний — hide_ids, готовые опубликованные kits при изменениях; в полной синхронизации также finalize и all_ids. Скрытие должно происходить по валидному последнему пакету, повторные запросы должны быть безопасны. Обработка пакетов и транзакций на сервере требует проверки исходников.

`POST /pim/photos` с `{limit:30}`: обработать очередь источников изображений, возвращать pending, processed, errors, failed. Фотографии должны реально скачиваться и появляться на https://rubizh.shop/media/...; одной подстановки URL недостаточно. `GET /pim/status`: реальная статистика products.visible/hidden, variants, categories, photos.ok/pending/error.

## Комплекты 10.5: обязательный контракт v1

Исходников сервера в переданных файлах нет. Следующие требования должен реализовать сервер магазина; один frontend не обеспечивает проверку заказа.

`GET /pim/status` должен дополнительно вернуть `capabilities: {"kit_validation_version": 1}`. PIM проверяет эту возможность перед передачей непустого изменённого состава. Отсутствие возможности вызывает понятную ошибку, а не передачу данных, которые старый сервер может проигнорировать.

При передаче массива `kits` PIM добавляет `kits_validation_version: 1` и `kits_request_hash`. Сервер валидирует и сохраняет весь массив транзакционно и возвращает тот же `kits_request_hash` только после успешного сохранения. Пустой массив означает скрытие всех комплектов. Если hash не подтверждён, PIM не обновляет отметку сохранённых комплектов. Повтор идентичного запроса должен быть безопасен.

У каждого комплекта есть `id`, `name`, `note`, `palette`, `items`, `common_sizes`, `common_heights`, `price_min`, `price_max`, `availability`, `lead_time_days`, `validation_version`. Каждая позиция содержит `product_id`, `role`, `color`, целое `quantity` от 1 до 10 и `allowed_skus`. Цена считается по фактически выбранным артикулам, умножается на количество; двойная позиция плит не может списываться как одна плита. Упаковка из двух плит — одна единица товара с подтверждённым составом.

Перед показом и оформлением заказа сервер заново проверяет:

- все обязательные роли присутствуют; недоступную позицию нельзя просто удалить из состава;
- артикулы входят в `allowed_skus`, относятся к заданному товару и цвету, имеют совместимые размеры и рост;
- актуальные цены, количество и доступность каждой позиции; истекшие предложения и блокированные скачки закупки не считаются наличием;
- предзаказ действительно разрешён, его срок подтверждён; единицы срока и календарь производства берутся из исходного `lead_time`, неизвестный срок не заменяется тремя днями;
- совместимость плит с плитоноской и количество плит в упаковке;
- суммарные скидки и допустимую маржу: клиентские значения не заменяют серверную проверку.

Резервирование остатков и создание заказа выполняются в одной серверной транзакции. Для конкурирующих заказов нужны блокировки/атомарные условия обновления, ключ идемпотентности и освобождение резервов при отмене/истечении срока. Одна позиция может входить в разные виртуальные комплекты; расход общего остатка проверяется при заказе. Неизвестный количественный остаток не превращается в искусственные «5 штук».

Изменения каталога, скрытие товаров, настройки и состав комплектов должны применяться согласованно. При частичной ошибке пакета нельзя подтверждать сохранение неподдержанного состава. Публичный API не должен раскрывать закрытые данные поставщиков, закупки, ключи или документы.

Постоянные Google/Meta-фиды формирует сервер из реально готовых фото и отмеченных товаров. Приёмка площадками требует их отчётов. Пром отложен.

NP: публичные Ref подтверждены по справочнику и сохранены в np-origins.json. Для Киборга отправка до 30 кг — №9, свыше — №36. Сервер должен учитывать вес всего отправления. Если вес неизвестен, выбор тяжёлого отделения нельзя считать подтверждённым. Для настоящей ТТН нужны реальные sender/counterparty/contact refs и телефон; PIM не заменяет эти данные. NP API-ключ в сборку не включён.


## Канонические категории v1 (PIM 10.7.0)

После успешной миграции `/pim/status` должен возвращать:

```json
{"ok":true,"capabilities":{"canonical_category_version":1}}
```

`POST /pim/sync` получает справочник `categories:[{id,name,parent_id,path}]`, `categories_schema_version:1`, `category_catalog_hash` и товары с `canonical_category_id`. Категория товара должна быть существующим листом справочника; сервер принимает только 134 согласованных ID, не создаёт категорию из сырого пути поставщика. `category`/`category_path` служат отображением, стабильная связь строится по ID. Переименование названия не меняет ID. Смена категории выполняется как обновление существующего `product.id`, а не создание новой карточки.

Сервер атомарно сохраняет справочник и подтверждает `category_catalog_hash` точным полученным значением. Для каждого успешного `results` возвращает `{id,status,canonical_category_id}` с фактически сохранённой категорией; для отказа — `{id,status:"error",error}`. PIM не записывает локальный успешный хэш товара, если подтверждение неполное или ID отличается.

`all_ids` может содержать ранее опубликованные товары, которые сейчас требуют категоризации и отсутствуют в `products`. Их нельзя удалять или скрывать только по отсутствию в обновлении. Такие ID означают сохранение существующей записи без обновления; `hide_ids` обрабатывается отдельно. Последняя подтверждённая категория сохраняется, неизвестная категория не заменяет её на NULL. `attributes` содержит дополнительно выделенные пол, сезон, камуфляж и другие подтверждённые данные.

Физическое резервирование остатков и проверка комплекта при заказе по-прежнему выполняются сервером магазина. Исходники этого сервера не предоставлены; эта сборка добавляет клиентский контракт и проверку совместимости, а не его реализацию.

## Product model v1 (PIM 10.8.0)

`GET /pim/status` must advertise `capabilities.product_model_version >= 1` before the PIM with activated normalization sends any sync POST. This capability is separate from canonical_category_version and kit_validation_version.

Products retain legacy `id`, `name`, `category`, `category_path`, `legacy_attributes`, price and stock fields. Authoritative fields include product_id, product_model_version=1, marketing_name_uk, canonical_category_id/path, primary_product_type, typed attributes/filter_attributes, variant sizes (raw/display/normalized/system/unconfirmed), color and camouflage separately, site_price, availability, quality_score, publication_readiness, kit_component/tags/eligible/priority, optional budget_tier, compatibility, recommended_with, alternative_group and typed relations.

The server must persist these fields atomically with the product and variants. It must not reclassify names, merge models or convert missing sizes or zero stock to defaults/preorder. Raw supplier descriptions, purchase costs and supplier row records remain private inside PIM backups; fulfillment routing stays authenticated and out of public storefront responses. A successful per-product result must include its canonical_category_id and product_model_version=1; a missing acknowledgement is an error and must not produce a successful client sync state. Timestamp site_synced_at is written only for acknowledged current payloads.

Unknown compatibility must remain unknown; manual incompatible relations win. Hidden/non-buyable recommendations must be excluded by the storefront. Canonical filter_schema and category banner metadata are transmitted in categories and settings; the server must validate referenced IDs. Banner version/active flags are independent from category display names.

The server must enforce permissions for margin overrides independently of client controls and audit the authenticated actor. Local-browser mode represents the owner as local-admin; client checks are not a replacement for server authorization.

No shop server implementation was provided. Storefront adaptation, API database migrations, checkout stock reservation, and end-to-end acknowledgement require that repository before production acceptance can be completed.

## SIMPLE / colors v1 (PIM 10.9.0)

`GET /pim/status`: advertise `model_colors_version >= 1` and `order_on_request_version >= 1` only after implementing their complete behavior. Every successful product result must acknowledge `model_colors_version:1` in addition to existing product/category acknowledgements.

One product ID is one model. `colors[]` contains stable color IDs, separate color/camouflage, source-associated photos, `photo_assignment`, and `variant_skus`. Each product variant has `color_id` and a unique SKU. The storefront color selector displays exactly that color's gallery and size options, and changing size resolves an exact SKU and its price/availability. Never merge SKU based only on size+color. Never replace a color gallery with the full model gallery. When assignment is unknown, keep it unknown. The image processor must fetch and validate every referenced color gallery, not only product.photos. Invalid image errors must identify model and color; template rendering must handle empty/failed galleries.

`source_product_ids` plus archived aliases identify old color cards. Save aliases and redirects to the surviving model atomically before acknowledging the merge; preserve old carts and supplier fulfillment by SKU. `hide_ids` hides obsolete cards and missing-content cards even if a client had no publication hashes. Acknowledgement `hidden_ids` must list exactly the requested distinct IDs. A numeric hidden count alone is insufficient.

Owner-authorized requests: `order_on_request:true`, `requires_order_confirmation:true`, `stock:0`, `availability:"preorder"`, label `Під замовлення`, `preorder_confirmed:false`, `lead_time_days:null`. Do not invent a manufacture deadline or treat these as stocked goods. Checkout must require manager confirmation and never reserve nonexistent stock. Explicit supplier-confirmed preorder remains a separate case with its confirmed term. Stale stock must not be advertised as newly confirmed stock.

Confirmed payload/hash checkpoints and publish batch journals are stored by the PIM after every accepted packet. This does not implement server revision locks, concurrent-edit conflict handling, full-operation rollback, order confirmation or stock reservations; implement those in the shop backend. These server changes are prerequisites for production end-to-end acceptance and were not deployed in this release.


## Защита скидок v1 (PIM 10.9.2)

См. [полное ТЗ магазина](SHOP-PRICING-TZ.md). PIM применяет согласованные 30% / 25% / 20%, передаёт допустимые оптовые цены, `kit_price` и `minimum_sale_price`, с защитой остатка 15% после доната и указанных расходов. Магазин не должен самостоятельно вычитать 12%/18% или складывать скидки. Перед синхронизацией необходима `capabilities.pricing_policy_version >= 1`, каждый успешный результат дополнительно подтверждает `pricing_policy_version: 1`. Поддержку объявлять только после серверной проверки корзины и заказа. Исходники магазина отсутствуют; эти серверные изменения и продакшен-проверка здесь не выполнены.
