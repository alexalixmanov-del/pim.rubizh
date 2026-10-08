# РУБІЖ PIM 10.9.3 RC — итоговый runtime-отчёт

Review-ветка `review/pim-10.9.3-rc`. Основание: принятая category/size integration `14c62909f067d43d7dd98528cd1b5317f2d831fd` и inventory dry-run `c783e077f693d34326eef894491192bcf86477d6` с подтверждением пользователем формата Prom для UKR-TEC. Этот отчёт заменяет прежний черновик RC с обязательным численным stock.

**Production не установлен. Сайт, публикация, скрытие и архивирование не запускались. Сеть review PIM и `/pim/sync` заблокированы.** Изменения классификации и policies применены только к контрольной копии. REAL_SOURCE_COMPATIBILITY и реальный checkout остаются отдельными незавершёнными задачами.

## Inventory policies в runtime

Наличие поставщика определяется по его подтверждённому формату; `stock_quantity=null` не означает автоматически UNKNOWN. M-WIN, Киборг и Армолайн используют точные STATUS mappings `есть → IN_STOCK`, `нет → OUT_OF_STOCK`. UKR-TEC использует подтверждённую семантику стандартного экспорта Prom: `+` и `!` → IN_STOCK, `-` → OUT_OF_STOCK; положительное целое в Наявність → PREORDER с указанным сроком доставки. `!` отдельно задаёт ready_to_dispatch. Все количества в этих STATUS policies остаются null.

У UKR-TEC `3` означает **доставку под заказ в 3 дня**, а не три единицы и не срок производства. Экспортирует `delivery_lead_time_days=3`, `lead_time_days=null`, оплату только после менеджера. Источник формата: [официальная спецификация Prom](https://support.prom.ua/hc/uk/articles/360004960817), сохранённая evidence в предыдущем inventory dry-run.

Tactical Belt остаётся кандидатом QUANTITY: пользователь сообщил, что подтверждения смысла чисел ещё нет. 1 512 bindings дают UNKNOWN и **одно supplier-level исключение**, без догадок о количестве. После отдельного подтверждения можно активировать правило `>0 → IN_STOCK`, `0 → OUT_OF_STOCK`, пустое/невалидное → UNKNOWN. Сейчас оно не активировано.

FEED_PRESENCE поддержан только для подтверждённого supplier rule и реально импортированной валидной строки. Ни одному из пяти поставщиков этот режим не назначен. Для новых поставщиков без правила действует NO_AVAILABILITY_SIGNAL.

| Supplier | Inventory mode | IN_STOCK | OUT_OF_STOCK | PREORDER | UNKNOWN |
|---|---|---:|---:|---:|---:|
| м вин | STATUS | 923 | 1 | 0 | 0 |
| тактикал белт | QUANTITY (не подтверждён) | 0 | 0 | 0 | 1512 |
| армолайн | STATUS | 1155 | 250 | 0 | 0 |
| укр тек | STATUS | 974 | 4 | 1 | 0 |
| киборг | STATUS | 3135 | 779 | 0 | 0 |
| **Всего 8 734 bindings** | | **6 187** | **1 034** | **1** | **1 512** |

Это доступность **supplier observation**, до проверок размера и binding конкретного SKU. Она отдельно передаётся как `availability_status`, `availability_source`, `availability_confirmation`. UNKNOWN numeric quantity: **8734** реальных вариантов, при этом подтверждённый STATUS разрешает продажу. Количества не придуманы.

## Заказ, оплата и второй слой готовности

Contract v3 содержит `order_policy_version=1`, `inventory_policy_version=1`. `checkout_allowed` отклоняется schema. Передаются три отдельных поля:

| Выбранный SKU / опция | order_submission_allowed | payment_allowed | requires_order_confirmation |
|---|---|---|---|
| IN_STOCK + подтверждённый SKU/size/binding + допустимая цена | true | true | false |
| PREORDER, подтверждённый источником | true | false | true |
| ORDER_ON_REQUEST | true | false | true |
| SIZE_CONFIRMATION_REQUIRED | true | false | true |
| UNKNOWN | false | false | true |
| OUT_OF_STOCK | false | false | false |

Для STATUS численного количества не требуется. Для QUANTITY положительное количество обязательно, ноль означает OUT_OF_STOCK. Недопустимая цена/маржа не разрешает оплату даже IN_STOCK. Model flags — сводка, решение об оплате принимает выбранный реальный SKU. Model size option без SKU не становится оплачиваемым вариантом.

| Готовность реальных SKU (взаимоисключающие группы) | Количество |
|---|---:|
| PAYMENT_READY | **4915** |
| BINDING_CONFIRMATION_REQUIRED | 626 |
| SIZE_CONFIRMATION_REQUIRED после выделения binding-группы | 848 |
| NOT_PAYMENT_READY по availability/цене | 2345 |

Независимые проверки, включая пересечения: size needs confirmation=1446, binding needs confirmation=626, overlap=598. Их нельзя складывать как отдельные SKU.

| Итоговая SKU availability после всех gates | Количество |
|---|---:|
| IN_STOCK | 4915 |
| OUT_OF_STOCK | 950 |
| PREORDER | 0 |
| ORDER_ON_REQUEST | 0 |
| UNKNOWN | 2021 |
| SIZE_CONFIRMATION_REQUIRED | 848 |

Supplier PREORDER=1 не обязан оставаться SKU PREORDER: у этой записи не подтверждён размер; size gate имеет приоритет, источник остаётся видимым. PAYMENT_READY означает контрактную готовность, не публикацию и не успешный платёж на реальном сайте. Guards фото/контента и статусы публикации сохранены; товаров на сайт этим импортом не отправляли.

Export schema, SIMPLE payload и in-memory mock API обновлены. Mock проверяет выбранные размер/цвет/SKU/цену, повторную проверку перед оплатой, заявки и подтверждение менеджером. Buyer-provided flags не разрешают оплату. `/pim/sync` mock также заблокирован. Это проверка контракта, не интеграция отсутствующего checkout магазина.

## Последнее валидное наблюдение и ручные подтверждения

Возраст файла не является событием изменения stock. Последний валидный quantity или STATUS observation действует до новой валидной записи либо ручной коррекции. Пустое, неизвестное, невалидное или явно более старое обновление не стирает подтверждённое состояние. Изменения цены/фото могут обновляться независимо. Пропавшая строка не обнуляется: zeroMissing выключен в review pipeline.

`last_valid_inventory_observation` привязан к supplier SKU и подписи policy; его нельзя переиспользовать для другого SKU или изменённого правила. Manual quantity/availability и locks имеют приоритет над cache и supplier update. Явный manual status не придумывает количество.

`stock_observed_at`, `source_updated_at`, `stock_data_age_hours`, `stale_source` — metadata. Supplier `stock_freshness_hours` задаёт только warning threshold, безопасный default warning 36 часов. **Глобального TTL для изменения availability нет.** `imported_at` не подменяет наблюдение. Только явно переданный supplier `expires_at` может ограничить срок действия observation; warning никогда его не создаёт.

Без версии/даты поставщика невозможно доказать порядок двух разных файлов: новая изменённая валидная запись принимается как последнее поданное наблюдение. Повторная та же запись сохраняет observation metadata. Нормальный импорт новой карточки через очередь также сохраняет actual source column, dedicated size, timestamps и order fields.

## Два контрольных preview → apply

Копия: 3 113 товаров, 8 734 SKU variants и bindings. Источник — **RECONSTRUCTED_FROZEN_OFFER_REPLAY** из сохранённой базы, не оригинальный workbook поставщика. Пройдены runtime preview, apply, backup, IndexedDB persist/read-back, затем второй идентичный импорт всех пяти поставщиков. **Все 3 113 normalized exports проверены JSON schema.**

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

Сохранены исходные 134 category objects без переименований/перемещений, добавлены 9 утверждённых IDs; cfg supplier mappings не изменены. Per-SKU/per-binding защищённые фото, исходные и рассчитанные цены, stock, исходное время stock, publication/archive flags и manual fields совпали. **8 product manual locks сохранены**, before/after hashes равны. Исходных variant locks нет; конфликты variant locks проверены fixtures.

| Confidence всей runtime-копии | SAFE_AUTO | LIKELY | AMBIGUOUS |
|---|---:|---:|---:|
| Категории товаров | 2711 | 194 | 204 |
| Размеры реальных вариантов | 7866 | 1 | 867 |

4 архивных aliases без supplier rows нетронуты. Контроль исходных 124 category cases совпал с принятым отчётом: **109 SAFE_AUTO / 12 LIKELY / 3 AMBIGUOUS**, все SAFE category IDs прежние. Это исходная очередь, она отличается от confidence по всей базе.

- Exact SKU → size: **4199**.
- allowed_sizes без SKU: **1145**, только model options, без fake stock/SKU.
- SIZE_CONFIRMATION_REQUIRED всех реальных вариантов: **1446**.
- NO_SIZE_REQUIRED: **3068**, fake One Size не создаётся.
- ONE_SIZE, подтверждённый источником: **21**.
- Category/size exceptions: **148 групп**.
- Inventory exceptions: **1 группа**, Tactical Belt, 1 512 bindings.

Второй импорт создал 0 SKU, 0 duplicate size options и 0 duplicate exceptions. Category/size evidence, fingerprints, каталоги размеров, normalized export и order permissions совпали. Из export hash исключены только вычисляемые по текущему времени age/stale metadata; сами наблюдения защищены отдельно.

```text
export_first_sha256  = ebbf5c36a8e3746b6c45eb7c0ec300a10278cc6367e43bfc81c15a1c0385869a
export_second_sha256 = ebbf5c36a8e3746b6c45eb7c0ec300a10278cc6367e43bfc81c15a1c0385869a
```

Операционные logs/imported_at отражают запуск; они не новые supplier observations. Frozen baseline SHA256: `9ee5645236db92e5373dea1a875a83d821ec86bab64f4acc1e4316b7183ee5f3`. Приватный candidate и supplier catalog хранятся вне Git, исходный backup не перезаписан.

## Проверки и сборка

**575 tests приложения + 49 size + 78 accepted-category = 702 passed, failures 0.** Чистая копия staged sources отдельно собрана: build и 575 tests прошли, HTML SHA совпал. Зависимости установлены по lockfile; параметры окружения менять не потребовалось.

Проверены cancel preview, STALE_PREVIEW, rollback при failed persist и failed persisted verification. Review startup не ремонтирует/объединяет SKU, не мигрирует цены и не публикует автоматически. Новые regression tests покрывают nullable STATUS payment, реальный Prom import `3`, source-column evidence, manual overrides, invalid/older observations, grouped policy questions, создание новой карточки и отсутствие stock column у NO_AVAILABILITY_SIGNAL.

Архив собран дважды с одинаковым SHA; все локальные lib/vendor references включены. Без installer, backup и supplier catalog. Только review copy, отдельный IndexedDB namespace и заблокированная сеть.

## Что ещё требуется для реального запуска

[REAL_SOURCE_COMPATIBILITY.json](REAL_SOURCE_COMPATIBILITY.json): **BLOCKED**, production_autoprices_allowed=false. Checker поддерживает XLS/XLSX/CSV/XML, actual sheet/header/mapping, size/range/color и supplier inventory semantics; семь parser tests — fixtures, они не заменяют реальные прайсы.

По каждому из пяти поставщиков отсутствует один оригинальный XLS/XLSX/CSV/XML или актуальная HTTPS-ссылка. Доступные ZIP повторно проверены: старый пакет — код, backup ZIP — JSON и macOS metadata; оригинальных прайсов в них нет. Saved rows используются в контрольном replay. Файлы вопросов `supplier-sizes-*.csv` также не workbook поставщика. Для совместимости нужна реальная структура sheet/header и профиля; [real-source-inputs.example.json](real-source-inputs.example.json) задаёт точный вход. Mapping stock у STATUS — колонка статуса, а не количества.

```bash
node audit/real-source-compatibility.cjs /private/real-source-inputs.json /private/source-compatibility-report.json
```

Exit 2 при отсутствии inputs означает незавершённый gate. PASS parser gate сам по себе не включает production automation. Tactical Belt отдельно требует подтверждения «Наличие = количество единиц по артикулу».

Для магазина требуются конкретные компоненты, которых в этом checkout нет: исходник страницы товара и JS selector/gallery; server cart/checkout handler; payment-session/create-payment handler; endpoint подтверждения менеджером; server `/pim/sync` handler; DDL/model таблиц variants, orders/order_items и reservations. Путь/репозиторий этих файлов не известен: текущий repo содержит PIM и contract mock. Нужна тестовая копия магазина, поддерживающая contract v3/order1/inventory1, до реального sync и end-to-end заказа.

Все первоначальные направления сохраняются в [TASKS.md](TASKS.md): descriptions/translation, комплекты, модель/цвета/размеры, цены, фото, UI/feedback и автоматизация. RC не объявляет всю систему доведённой до идеала. Текст запроса поставщикам подготовлен в [SUPPLIER-REQUEST.md](../inventory-policy-final-dry-run-2026-10-08/SUPPLIER-REQUEST.md), сообщения никому не отправлялись.

## Материалы review

- [Сборка 10.9.3 RC](rubizh-pim-10.9.3-rc.zip)
- [Control import](control-import.json), [exceptions](exceptions.json), [manifest](manifest.json)
- [PREORDER export sample](export-preorder-sample.json) — синтетический test fixture, не реальные товары.
- Runtime SHA256: `f15f91373d8f366b2c1dee5b914bd95b3505834d10aede36a599d3787c9e0a3f`.
- Archive SHA256: `4e60646fcebc95ddd96b92bd07c8a16012c561b84b2e845e920cc912cd52492a`.

Production deployment, сайт, массовая публикация и автопрайсы не запускались. До отдельного подтверждения release и поддержки нового contract магазином эти действия остаются заблокированными.
