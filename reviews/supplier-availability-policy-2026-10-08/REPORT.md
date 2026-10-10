# Inventory semantics — финальный read-only dry-run

**Только dry-run. Policies, рабочая cfg, товары, taxonomy, сайт и production не изменены.** UKR-TEC полностью исключён из автоматического назначения policy по последнему указанию пользователя; `+ / - / ! / 3` пока не трактуются.

Проанализированы все **8 734 bindings / реальные PIM SKU** и 3 113 товаров из контрольной копии. В этих данных на каждый вариант приходится одна supplier binding. Прочитан и исходный присланный ZIP backup: набор `supplier_id + supplier_sku + rawAvailability + stock + derived_availability` с сохранением повторений совпадает. Внутренние model IDs после предыдущих группировок не использовались для этого cross-check. SHA и результаты находятся в [analysis.json](analysis.json).

Это сохранённые данные, **не исходные строки workbook**: `source_row_raw` пуст у всех bindings, `lastRows` хранит число строк. Исходные XLS/XLSX/CSV/XML и подтверждённые supplier format profiles среди доступных вложений отсутствуют. Предложение строго ограничено подтверждаемой семантикой сохранённых значений.

## Итоговое предложение

| Supplier | Source column | Inventory mode | Решение по evidence |
|---|---|---|---|
| M-WIN | Наличие | STATUS | `есть / нет` подтверждены сохранёнными значениями; SAFE_AUTO предложение |
| Tactical Belt | Наличие | QUANTITY — кандидат | Числа 0–1265; quantity semantics не подтверждена, policy не активировать |
| UKR-TEC | Наявність | STATUS — кандидат | Policy не активировать; все 4 tokens требуют проверки исходного формата |
| Киборг | Наличие | STATUS | `есть / нет` подтверждены; SAFE_AUTO предложение |
| Армолайн | Наличие | STATUS | `есть / нет` подтверждены; SAFE_AUTO предложение |

**FEED_PRESENCE не подтверждён ни у одного supplier.** Наличие строки в backup не доказывает возможность заказа. NO_AVAILABILITY_SIGNAL не описывает этих suppliers: сигнал в колонке есть у каждого; у двух поставщиков не закрыта его семантика. Для них кандидат mode хранится отдельно от флага подтверждения/активации, а resolver в dry-run возвращает UNKNOWN.

## Результат виртуального применения policies

| Supplier | IN_STOCK | OUT_OF_STOCK | PREORDER | UNKNOWN | Всего PIM SKU |
|---|---:|---:|---:|---:|---:|
| M-WIN | 923 | 1 | 0 | 0 | 924 |
| Tactical Belt | 0 | 0 | 0 | 1512 | 1512 |
| UKR-TEC | 0 | 0 | 0 | 979 | 979 |
| Киборг | 3135 | 779 | 0 | 0 | 3914 |
| Армолайн | 1155 | 250 | 0 | 0 | 1405 |
| **Всего** | **5213** | **1030** | **0** | **2491** | **8734** |

Это `availability_status` **supplier observation для SKU**, а не итоговые payment permissions. Policy STATUS не отменяет manual locks, точное SKU-size/color binding и отдельную SIZE_CONFIRMATION_REQUIRED. Например, у UKR-TEC 979 bindings относятся к 447 supplier SKU; 94 supplier SKU groups обслуживают несколько вариантов. Общая строка поставщика не доказывает наличие всех размеров/цветов.

Количество не создаётся: **stock_quantity=null для всех STATUS records**. Для Tactical Belt оно тоже остаётся null до подтверждения смысла числа. Подтверждённое STATUS наличие само по себе не должно блокировать продажу только из-за отсутствия numeric stock. Отдельные проверки SKU/size/цены продолжают действовать. Здесь разрешения оплаты не пересчитывались и не записывались.

## M-WIN

- `supplier`: M-WIN (`sf0t3l7jegf9`)
- `source_column`: `Наличие` по сохранённому mapping
- `inventory_mode`: `STATUS` — предложение SAFE_AUTO для известных tokens
- `stock_quantity`: null; quantities_created=0

`unique_raw_values` / `count_per_value`:

| Raw value | Количество bindings |
|---|---:|
| `есть` | 923 |
| `нет` | 1 |

**5 примеров сохранённых bindings. Это не оригинальные supplier rows.**

| SKU PIM | Supplier SKU | Товар | Размер / цвет в PIM | Исходный availability token |
|---|---|---|---|---|
| RUB-00461 | BM-6х10 | Маскувальна сітка M-WIN мультикам. Маскування зима. 6х10 м (площа 60 кв.м.) | : 6х10 / Білий мультикам | `есть` |
| RUB-00758 | Kh-8х10 | Маскувальна сітка M-Win Хижак. Маскування осінь, весна. 8х10 м (площа 80 кв.м.) | : 8х10 / Хижак | `нет` |
| RUB-00475 | 0000BM | Маскувальна сітка M-WIN мультикам. Маскування зима. Індивідуального розміру (ціна за 1 кв.м.) | : Індивідуальний розмір / Білий мультикам | `есть` |
| RUB-00616 | SM-8х9 | Маскувальна сітка M-Win Світлий мультикам. Маскування весна, літо, осінь. 8х9 м (площа 72 кв.м.) | : 8х9 / Світлий мультикам | `есть` |
| RUB-00254 | ZL-3х8 | Маскувальна сітка M-Win Зелене листя. Маскування весна, літо. 3х8 м (площа 24 кв.м.) | : 3х8 / Зелене листя | `есть` |

- `IN_STOCK rule`: exact `есть` после trim/lowercase в выбранной supplier колонке.
- `OUT_OF_STOCK rule`: exact `нет` в той же колонке.
- `PREORDER rule`: среди сохранённых значений не подтверждён; `нет` не становится preorder. Новый token «под заказ» потребует отдельного supplier mapping/evidence.
- `UNKNOWN rule`: незнакомое, пустое или невалидное значение при отсутствии предыдущего подтверждённого observation/manual state. Оно не заменяет последнее valid состояние.

Предлагаемый `inventory_policy` (данные отчёта, не запись в cfg):

```json
{
  "supplier_id": "sf0t3l7jegf9",
  "inventory_mode": "STATUS",
  "source_column": "Наличие",
  "confirmed_by_saved_semantics": true,
  "activation": "DRY_RUN_ONLY",
  "status_mapping": {
    "есть": "IN_STOCK",
    "нет": "OUT_OF_STOCK"
  },
  "quantity_positive_rule": null,
  "quantity_zero_rule": null,
  "preorder_mapping": {},
  "unknown_rule": "UNKNOWN unless an earlier confirmed observation or manual override applies",
  "feed_presence_confirmed": false,
  "age_changes_availability": false,
  "numeric_stock_required": false
}
```

## Tactical Belt

- `supplier`: Tactical Belt (`s4p9slmnn0ki`)
- `source_column`: `Наличие` по сохранённому mapping
- `inventory_mode`: `QUANTITY` — не подтверждён, не активировать
- `stock_quantity`: null; quantities_created=0

`unique_raw_values` / `count_per_value`:

| Raw value | Количество bindings |
|---|---:|
| `0` | 1148 |
| `1` | 85 |
| `2` | 44 |
| `3` | 36 |
| `4` | 30 |
| `5` | 22 |
| `6` | 15 |
| `7` | 12 |
| `8` | 14 |
| `9` | 4 |
| `10` | 6 |
| `11` | 8 |
| `12` | 9 |
| `13` | 3 |
| `14` | 3 |
| `15` | 3 |
| `16` | 5 |
| `17` | 3 |
| `18` | 2 |
| `19` | 2 |
| `20` | 2 |
| `22` | 2 |
| `24` | 3 |
| `27` | 2 |
| `30` | 2 |
| `31` | 1 |
| `32` | 1 |
| `34` | 2 |
| `35` | 1 |
| `36` | 2 |
| `38` | 1 |
| `42` | 1 |
| `43` | 2 |
| `44` | 1 |
| `46` | 1 |
| `48` | 1 |
| `50` | 2 |
| `59` | 1 |
| `60` | 1 |
| `61` | 1 |
| `62` | 2 |
| `66` | 1 |
| `67` | 1 |
| `68` | 1 |
| `73` | 1 |
| `81` | 1 |
| `93` | 1 |
| `110` | 1 |
| `111` | 2 |
| `112` | 1 |
| `177` | 1 |
| `230` | 1 |
| `238` | 1 |
| `346` | 1 |
| `421` | 1 |
| `766` | 1 |
| `769` | 1 |
| `791` | 1 |
| `834` | 1 |
| `836` | 1 |
| `857` | 1 |
| `884` | 1 |
| `925` | 1 |
| `928` | 1 |
| `985` | 1 |
| `1265` | 1 |

**5 примеров сохранённых bindings. Это не оригинальные supplier rows.**

| SKU PIM | Supplier SKU | Товар | Размер / цвет в PIM | Исходный availability token |
|---|---|---|---|---|
| RUB-05564 | PM-2-M | Підсумок медичний з панеллю швидкого скидання NAVIGARA | M / Мультикам | `0` |
| RUB-05560 | 1404-3 | Підсумок для скидання магазинів (MOLLE, на тактичний пояс, розвантаження, РПС) | — / Чорний | `1` |
| RUB-05653 | KP-25 | Повербанк King Power 40000 mah | — / — | `3` |
| RUB-05249 | 2310 | Карабін для збройового ременя | — / Чорний | `48` |
| RUB-05510 | THOR4 | Одноточковий плечовий ремінь з кріпленням до плитоноски RAGNAROK THOR | — / OLIVE | `1265` |

- `IN_STOCK rule`: **после подтверждения QUANTITY** — valid numeric quantity > 0. Сейчас не активна.
- `OUT_OF_STOCK rule`: **после подтверждения QUANTITY** — quantity = 0. Сейчас не активна.
- `PREORDER rule`: отсутствует; 0 не preorder.
- `UNKNOWN rule`: пока supplier numeric semantics не подтверждена — все 1512 observations. После подтверждения — missing/invalid quantity без предыдущего valid observation.

66 разных целых значений, 1148 нулей и 364 положительных, максимум 1265. Это убедительный кандидат на количество, но название `Наличие` и прежний derived status `in/out` не являются независимым подтверждением unit semantics. Числа не превращаются в остатки по догадке.

**Одно недостающее подтверждение для всего supplier:** оригинальная строка/header/profile или пояснение «Наличие — число единиц по supplier SKU, 0 — отсутствует». Тогда dry-run сможет восстановить quantity из сохранённого raw token и пересчитать 1512 observations без ручного разбора каждого SKU. Сейчас такое восстановление не выполнено.

Предлагаемый `inventory_policy` (данные отчёта, не запись в cfg):

```json
{
  "supplier_id": "s4p9slmnn0ki",
  "inventory_mode": "QUANTITY",
  "source_column": "Наличие",
  "confirmed_by_saved_semantics": false,
  "activation": "BLOCKED_SOURCE_SEMANTICS",
  "status_mapping": {},
  "quantity_positive_rule": "IN_STOCK",
  "quantity_zero_rule": "OUT_OF_STOCK",
  "preorder_mapping": {},
  "unknown_rule": "UNKNOWN unless an earlier confirmed observation or manual override applies",
  "feed_presence_confirmed": false,
  "age_changes_availability": false,
  "numeric_stock_required": true
}
```

## UKR-TEC

- `supplier`: UKR-TEC (`s2akya7xoafn`)
- `source_column`: `Наявність` по сохранённому mapping
- `inventory_mode`: `STATUS` — не подтверждён, не активировать
- `stock_quantity`: null; quantities_created=0

`unique_raw_values` / `count_per_value`:

| Raw value | Количество bindings |
|---|---:|
| `!` | 2 |
| `+` | 972 |
| `-` | 4 |
| `3` | 1 |

**5 примеров сохранённых bindings. Это не оригинальные supplier rows.**

| SKU PIM | Supplier SKU | Товар | Размер / цвет в PIM | Исходный availability token |
|---|---|---|---|---|
| RUB-08111 | 2011326508 | Куртка зимова тактична UKR-TEC slimtex omni-heat, мультикам | — / Камуфляж | `+` |
| RUB-08158 | 2497471190 | Плитоноска ALPC з системою Molle | — / Оливковий | `-` |
| RUB-08236 | 2607486188 | Тактична сумка через плече нагрудна 5л | — / піксель | `!` |
| RUB-08193 | 2727917856 | Спальний мішок | — / OLIVE | `!` |
| RUB-08667 | 2605347814 | Чоловічі лофери з натуральної замші сірі | — / Сірий | `3` |

- `IN_STOCK rule`: не подтверждена; даже `+` пока не интерпретируется по указанию пользователя.
- `OUT_OF_STOCK rule`: не подтверждена; `-` пока не интерпретируется.
- `PREORDER rule`: не подтверждена; ни `!`, ни `3` не превращаются в preorder/срок.
- `UNKNOWN rule`: все 979 observations до проверки реального supplier format, сохраняя отдельно исходный token. Рабочие значения не перезаписываются.

Формат заголовков похож на Prom export, но это подсказка, а не доказательство. Старый общий parser считает `!` наличием, а `3` — preorder с leadDays=3. Derived flags произведены самим parser и не подтверждают реальные supplier semantics. Нельзя использовать их как второе независимое evidence.

Для завершения нужны **исходные строки с `+`, `-`, `!`, `3`, соответствующий header и формат/пояснение значений**. Отдельный профиль может подтвердить значения и preorder delivery semantics; без него они остаются UNKNOWN. Требуется правило для всего supplier, а не 979 отдельных решений. В [analysis.json](analysis.json) сохранены все три special-token примера (`!`: 2, `3`: 1), без цен и личных данных.

Предлагаемый `inventory_policy` (данные отчёта, не запись в cfg):

```json
{
  "supplier_id": "s2akya7xoafn",
  "inventory_mode": "STATUS",
  "source_column": "Наявність",
  "confirmed_by_saved_semantics": false,
  "activation": "BLOCKED_SOURCE_SEMANTICS",
  "status_mapping": {},
  "quantity_positive_rule": null,
  "quantity_zero_rule": null,
  "preorder_mapping": {},
  "unknown_rule": "UNKNOWN unless an earlier confirmed observation or manual override applies",
  "feed_presence_confirmed": false,
  "age_changes_availability": false,
  "numeric_stock_required": false
}
```

## Киборг

- `supplier`: Киборг (`s2bggyi42dhh`)
- `source_column`: `Наличие` по сохранённому mapping
- `inventory_mode`: `STATUS` — предложение SAFE_AUTO для известных tokens
- `stock_quantity`: null; quantities_created=0

`unique_raw_values` / `count_per_value`:

| Raw value | Количество bindings |
|---|---:|
| `есть` | 3135 |
| `нет` | 779 |

**5 примеров сохранённых bindings. Это не оригинальные supplier rows.**

| SKU PIM | Supplier SKU | Товар | Размер / цвет в PIM | Исходный availability token |
|---|---|---|---|---|
| RUB-15509 | 7068-Ч | Металеве кріплення для ПНБ Wilcox L4 G30 NVG Mount | — / Чорний | `есть` |
| RUB-14242 | M-9mm-2 | Глушник NEMESIS MICRO 9 мм 1/2 | — / — | `нет` |
| RUB-15569 | VLF-H056 | Налобний світлодіодний ліхтарик VIDEX VLF-H056 1400Lm 6500K | — / Чорний | `нет` |
| RUB-16324 | 1869-2XL | Тактична зимова куртка нової генерації від бренду YINREN | 2XL / Графит | `есть` |
| RUB-16325 | 1869-3XL | Тактична зимова куртка нової генерації від бренду YINREN | 3XL / Графит | `есть` |

- `IN_STOCK rule`: exact `есть` после trim/lowercase в выбранной supplier колонке.
- `OUT_OF_STOCK rule`: exact `нет` в той же колонке.
- `PREORDER rule`: среди сохранённых значений не подтверждён; `нет` не становится preorder. Новый token «под заказ» потребует отдельного supplier mapping/evidence.
- `UNKNOWN rule`: незнакомое, пустое или невалидное значение при отсутствии предыдущего подтверждённого observation/manual state. Оно не заменяет последнее valid состояние.

Предлагаемый `inventory_policy` (данные отчёта, не запись в cfg):

```json
{
  "supplier_id": "s2bggyi42dhh",
  "inventory_mode": "STATUS",
  "source_column": "Наличие",
  "confirmed_by_saved_semantics": true,
  "activation": "DRY_RUN_ONLY",
  "status_mapping": {
    "есть": "IN_STOCK",
    "нет": "OUT_OF_STOCK"
  },
  "quantity_positive_rule": null,
  "quantity_zero_rule": null,
  "preorder_mapping": {},
  "unknown_rule": "UNKNOWN unless an earlier confirmed observation or manual override applies",
  "feed_presence_confirmed": false,
  "age_changes_availability": false,
  "numeric_stock_required": false
}
```

## Армолайн

- `supplier`: Армолайн (`s2hjvaqgnp29`)
- `source_column`: `Наличие` по сохранённому mapping
- `inventory_mode`: `STATUS` — предложение SAFE_AUTO для известных tokens
- `stock_quantity`: null; quantities_created=0

`unique_raw_values` / `count_per_value`:

| Raw value | Количество bindings |
|---|---:|
| `есть` | 1155 |
| `нет` | 250 |

**5 примеров сохранённых bindings. Это не оригинальные supplier rows.**

| SKU PIM | Supplier SKU | Товар | Размер / цвет в PIM | Исходный availability token |
|---|---|---|---|---|
| RUB-07174 | 00243000S0000000 | Термофутболка тактична "S.W.A.T." (CoolMax) | S / MM14 | `есть` |
| RUB-07170 | 0024302XL0000000 | Термофутболка тактична "S.W.A.T." (CoolMax) | 2XL / MM14 | `нет` |
| RUB-07171 | 0024303XL0000000 | Термофутболка тактична "S.W.A.T." (CoolMax) | 3XL / MM14 | `нет` |
| RUB-07172 | 00243000L0000000 | Термофутболка тактична "S.W.A.T." (CoolMax) | L / MM14 | `нет` |
| RUB-07173 | 00243000M0000000 | Термофутболка тактична "S.W.A.T." (CoolMax) | M / MM14 | `нет` |

- `IN_STOCK rule`: exact `есть` после trim/lowercase в выбранной supplier колонке.
- `OUT_OF_STOCK rule`: exact `нет` в той же колонке.
- `PREORDER rule`: среди сохранённых значений не подтверждён; `нет` не становится preorder. Новый token «под заказ» потребует отдельного supplier mapping/evidence.
- `UNKNOWN rule`: незнакомое, пустое или невалидное значение при отсутствии предыдущего подтверждённого observation/manual state. Оно не заменяет последнее valid состояние.

Предлагаемый `inventory_policy` (данные отчёта, не запись в cfg):

```json
{
  "supplier_id": "s2hjvaqgnp29",
  "inventory_mode": "STATUS",
  "source_column": "Наличие",
  "confirmed_by_saved_semantics": true,
  "activation": "DRY_RUN_ONLY",
  "status_mapping": {
    "есть": "IN_STOCK",
    "нет": "OUT_OF_STOCK"
  },
  "quantity_positive_rule": null,
  "quantity_zero_rule": null,
  "preorder_mapping": {},
  "unknown_rule": "UNKNOWN unless an earlier confirmed observation or manual override applies",
  "feed_presence_confirmed": false,
  "age_changes_availability": false,
  "numeric_stock_required": false
}
```

## Постоянные ограничения и следующий этап

- `stock_quantity=null` не означает UNKNOWN: подтверждённый STATUS может дать IN_STOCK / OUT_OF_STOCK без количества.
- Отдельные поля: stock_quantity, availability_status, availability_source, supplier policy ID/version и evidence, stock_observed_at, source_updated_at, stale_source. availability_source не смешивать с количеством.
- `cfg.stockYes=5` присутствует в backup. Не использовать его как fake quantity для статуса «есть».
- Последнее valid observation действует до нового valid observation/manual correction. Давность и отсутствие нового файла не являются stock events; freshness только warning/metadata. imported_at не превращается в stock_observed_at.
- UNKNOWN tokens группируются по supplier + source_column + pattern. Они не заменяют предыдущие valid observations и не создают preorder.
- PREORDER требует подтверждённого supplier source signal и менеджера перед оплатой. Срок производства не придумывается.
- FEED_PRESENCE требует отдельного supplier confirmation; для этих пяти оно отсутствует.

```text
POLICIES_APPLIED = 0
QUANTITIES_CREATED = 0
CFG_WRITES = 0
CATALOG_WRITES = 0
PRODUCTION_WRITES = 0
INPUT_CHECKSUM_UNCHANGED = true
```

Runtime/schema/mock API под новые inventory modes **не менялись в этом dry-run**. Numeric-only RC gate из прежней разработки не считается финальным по новому контракту. Старый RC отчёт помечен DRAFT_SUPERSEDED. Предстоит отдельная интеграция policies, проверка STATUS stock=null в schema/checkout и повторный runtime import на копии; live/site sync остаются заблокированы.

Для трёх supplier STATUS semantics закрыта на уровне сохранённых данных; для Tactical Belt/UKR-TEC окончательная семантика заблокирована конкретным недостающим evidence, перечисленным выше. Оригинальные workbook parsing/sheet/header mappings для production автопрайсов этим анализом не проверены.

## Повторение анализа

```bash
python3 reviews/supplier-availability-policy-2026-10-08/analyze.py /private/dry-run-baseline.json /tmp/availability-analysis
```

Script читает input, пишет только report aggregates в output, проверяет SHA input повторно. Никаких config/catalog migrations или network requests. Путь к архиву оригинального backup используется для cross-check только если он доступен. Сравнение не опирается на изменённые ранее model grouping IDs.
