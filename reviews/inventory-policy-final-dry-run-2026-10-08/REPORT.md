# Два supplier-level inventory rules — подробный dry-run

**Read-only.** Три STATUS policies приняты пользователем. UKR-TEC подтверждён пользователем как стандартный Prom.ua export, его STATUS semantics закрыта. Quantity semantics Tactical Belt пока не подтверждена; закрытой она не объявляется. Production, рабочие policies и каталог не менялись. Все исходные правки продолжают учитываться в [TASKS.md](TASKS.md).

## Доказательства и границы данных

Проверены сохранённые supplier bindings и соседний product/variant context из исходного backup. Все 8 734 bindings соответствуют отдельным PIM SKU; количество по наличию не придумано. Исходные `source_row_raw` отсутствуют. Mappings показывают выбранное поле, но не сохраняют весь исходный workbook/header. `source_description` — описание модели из supplier данных, не снимок всей строки прайса; соседние SKU/размер/цвет/атрибуты могут быть нормализованы PIM.

Полные результаты, частоты, примеры и description context: [dry-run.json](dry-run.json). Прочитана также официальная спецификация [Prom XLS/XLSX/CSV](https://support.prom.ua/hc/uk/articles/360004960817); сохранён ограниченный evidence extract в [prom-format-evidence.json](prom-format-evidence.json).

## Tactical Belt — 1 512 bindings

- `source_column`: **Наличие**, по сохранённому supplier mapping.
- `inventory_mode`: **QUANTITY — кандидат LIKELY; пока не активирован**.
- 66 уникальных raw values, целые числа от 0 до 1265.
- Zero: **1148**; positive: **364**; empty: **0**; nonstandard: **0**.
- `stock_quantity`: не восстановлен/не записан. Числа сохранены как raw tokens.

Вид значений и большие числа убедительно похожи на количество. Но статистика и заголовок `Наличие` не доказывают единицу измерения. Legacy-derived `in/out` — результат старого generic parser, а не независимое evidence. В описаниях выбранных SKU нет прямого подтверждения, что эта колонка содержит физический остаток. У некоторых descriptions слова «наявність» относятся к характеристике изделия, например встроенному кабелю, а не к stock.

**Недостающее подтверждение для всего supplier:** оригинальный файл/header/profile или supplier пояснение «Наличие = количество единиц по SKU». Это одно правило, не 1512 ручных решений.

При подтверждении QUANTITY: valid integer >0 → IN_STOCK, =0 → OUT_OF_STOCK; missing/invalid → UNKNOWN при отсутствии предыдущего valid/manual observation. Никаких preorder из нуля. Пустых/невалидных значений в этой сохранённой выборке нет; их поведение задаётся правилом, а не выдуманными примерами.

### Все уникальные значения и частоты

| Raw value | Bindings |
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

### ZERO: 1148 bindings

| SKU PIM | Supplier SKU | Товар | Размер / цвет | Raw value |
|---|---|---|---|---|
| RUB-05564 | PM-2-M | Підсумок медичний з панеллю швидкого скидання NAVIGARA | M / Мультикам | `0` |
| RUB-05565 | PM-1-P | Підсумок медичний з панеллю швидкого скидання NAVIGARA | — / Піксель | `0` |
| RUB-05768 | 126-00001-K | Рукавиці Mechanix Precision Pro | M / COYOTE | `0` |
| RUB-06065 | FFN5 | Флісова кофта Комбат з накладками Чорна | 48/4 / Чорний | `0` |
| RUB-06066 | FFN18 | Флісова кофта Комбат з накладками Чорна | 56/5 / Чорний | `0` |
| RUB-06169 | MILIGUS35 | Штани військові тактичні ММ-14 розмір 48 (M) | 48 M / Піксель | `0` |
| RUB-05669 | PB-1-L | Пояс бойовий широкий Warrior Spirit Розмір | L / Мультикам | `0` |
| RUB-05670 | PB-1-M | Пояс бойовий широкий Warrior Spirit Розмір | M / Мультикам | `0` |
| RUB-05671 | PB-1-XL | Пояс бойовий широкий Warrior Spirit Розмір | XL / Мультикам | `0` |
| RUB-05672 | PB-2-L | Пояс бойовий широкий Warrior Spirit Розмір | L / Піксель | `0` |

### POSITIVE_INTEGER: 364 bindings

| SKU PIM | Supplier SKU | Товар | Размер / цвет | Raw value |
|---|---|---|---|---|
| RUB-05510 | THOR4 | Одноточковий плечовий ремінь з кріпленням до плитоноски RAGNAROK THOR | — / OLIVE | `1265` |
| RUB-05560 | 1404-3 | Підсумок для скидання магазинів (MOLLE, на тактичний пояс, розвантаження, РПС) | — / Чорний | `1` |
| RUB-05653 | KP-25 | Повербанк King Power 40000 mah | — / — | `3` |
| RUB-05249 | 2310 | Карабін для збройового ременя | — / Чорний | `48` |
| RUB-05053 | KATANA-K | Збройовий ремінь Ragnarok «Katana» | — / COYOTE | `985` |
| RUB-05061 | KATANA-MM-HK | Збройовий ремінь Ragnarok «Katana» carbine Murdock | — / Мультикам | `769` |
| RUB-05715 | HEL-G2-QD-M | Ремінь збройовий триточковий RAGNAROK "Hel" Gen.II QD | M / Мультикам | `30` |
| RUB-05728 | BR-1-K | Ремінь тактичний ЗСУ | — / COYOTE | `2` |
| RUB-05346 | 103-00001-K | Кріплення Tacticals Gear Clip для системи MOLLE | — / COYOTE | `5` |
| RUB-05679 | 1575-9 | Присипка-дезодорант "Сушар" для ніг та взуття (з протигрибковим ефектом) 100 мл | — / — | `66` |

### EMPTY: 0 bindings

Записей нет; примеры не создавались.

### NONSTANDARD: 0 bindings

Записей нет; примеры не создавались.

## UKR-TEC — 979 bindings

`source_column`: **Наявність**, по сохранённому mapping. `inventory_mode`: кандидат **STATUS / PROM_EXPORT_PROFILE**, actual supplier profile подтверждён пользователем. Пользователь подтвердил actual source format. Основной dry-run использует документированную STATUS policy Prom; новые трактовки не записываются в рабочие данные.

| Token | Bindings | Что подтверждено официальной спецификацией Prom | Применено к UKR-TEC |
|---|---:|---|---|
| `+` | 972 | есть в наличии | Да, только в dry-run |
| `-` | 4 | нет в наличии | Да, только в dry-run |
| `!` | 2 | есть в наличии, «Готово до відправки» | Да, только в dry-run |
| `3` | 1 | в поле Наявність — доставка под заказ за 3 дня | Да, только в dry-run |

**`!` в Prom не означает preorder.** Цифра в **Наявність** не является количеством: Prom выделяет quantity в отдельную колонку **Кількість**. Если actual UKR-TEC profile действительно стандартный Prom export, `3` является supplier delivery term, а не stock=3 и не автоматически сроком производства. Не подменять delivery lead time обещанием изготовления.

Независимые признаки совместимости с Prom: mapping включает `Унікальний_ідентифікатор`, `Назва_позиції_укр`, `Опис_укр`, `Наявність`, `Посилання_зображення`; сохранённые photos у UKR-TEC ведут на images.prom.ua (4060 photo references по bindings); встречаются стандартные tokens. Это сильный форматный кандидат. Пользователь отдельно подтвердил: «Да, это экспорт Prom.ua». В сочетании с официальной спецификацией это закрывает supplier-level semantics без догадки о значениях. Оригинального workbook всё ещё нет: фактический sheet/header parsing и совместимость будущего файла этим не проверены.

Соседние данные трех особых observations:

- `RUB-08236 / 2607486188`: тактическая нагрудная сумка 5л, `!`, атрибут материал Оксфорд; описание не подтверждает физическое количество или preorder.
- `RUB-08193 / 2727917856`: спальный мешок, `!`; отдельного inventory пояснения в сохранённом описании нет.
- `RUB-08667 / 2605347814`: серые мужские замшевые лоферы, `3`, attrs цвет/вид обуви; описание не подтверждает stock=3. Legacy leadDays=3 вычислялся generic parser, не является независимым подтверждением.

На уровне semantics все 979 observations разобраны одним подтверждённым format rule: **974 IN_STOCK / 4 OUT_OF_STOCK / 1 PREORDER / 0 UNKNOWN**. Точные SKU-size bindings остаются отдельной проверкой. Для raw `3` допустим supplier delivery lead time 3 дня, **не manufacturing time**, stock_quantity=null; перед оплатой требуется менеджер.


### Token +: 972 bindings

| SKU PIM | Supplier SKU | Товар | Размер / цвет | Raw value |
|---|---|---|---|---|
| RUB-08111 | 2011326508 | Куртка зимова тактична UKR-TEC slimtex omni-heat, мультикам | — / Камуфляж | `+` |
| RUB-08475 | 1762015078 | Флісова балаклава | универсальный / KHAKI | `+` |
| RUB-07790 | 1762015061 | Берці демісезонні Памір | 40 / Коричневий | `+` |
| RUB-07797 | 1928443363 | Берці демісезонні Памір | — / Оливковий | `+` |
| RUB-08040 | 1774952016 | Кросівки тактичні демісезонні Ягуар | — / COYOTE | `+` |
| RUB-08485 | 1762015023 | Форма тактична військова статутна | 46 / пиксель | `+` |
| RUB-07959 | 1772501049 | Костюм тактичний Soft Shell | — / Оливковий | `+` |
| RUB-07960 | 2973736472 | Костюм тактичний Soft Shell | — / BLACK | `+` |
| RUB-07961 | 2973742211 | Костюм тактичний Soft Shell | — / Multicam | `+` |
| RUB-08721 | 2556205647 | Штани штурмові ріп-стоп | — / OLIVE | `+` |

### Token -: 4 bindings

| SKU PIM | Supplier SKU | Товар | Размер / цвет | Raw value |
|---|---|---|---|---|
| RUB-08158 | 2497471190 | Плитоноска ALPC з системою Molle | — / Оливковий | `-` |
| RUB-08157 | 2193765733 | Плитоноска з системою швидкого скиду ATTACK | Що регулюється / Мультикам | `-` |
| RUB-08246 | 2121336049 | Тактична футболка CoolMax піксель. | — / — | `-` |
| RUB-08160 | 2229433293 | Плитоноска, розвантаження зі швидким скиданням з напашником | Універсальний / Мультикам | `-` |

### Token !: 2 bindings

| SKU PIM | Supplier SKU | Товар | Размер / цвет | Raw value |
|---|---|---|---|---|
| RUB-08236 | 2607486188 | Тактична сумка через плече нагрудна 5л | — / піксель | `!` |
| RUB-08193 | 2727917856 | Спальний мішок | — / OLIVE | `!` |

### Token 3: 1 bindings

| SKU PIM | Supplier SKU | Товар | Размер / цвет | Raw value |
|---|---|---|---|---|
| RUB-08667 | 2605347814 | Чоловічі лофери з натуральної замші сірі | — / Сірий | `3` |

## Dry-run всех 8 734 bindings

Первый столбец — текущий dry-run четырёх подтверждённых STATUS policies, включая UKR-TEC. Второй сохраняет ранее принятый результат до подтверждения формата UKR-TEC. Третий — **условный сценарий Tactical Belt, не утверждённая policy**. Quantity/state/config не записываются.

| Availability supplier observation | Текущий подтверждённый dry-run | До подтверждения UKR-TEC | Если Tactical Belt подтверждён QUANTITY |
|---|---:|---:|---:|
| IN_STOCK | 6187 | 5213 | 6551 |
| OUT_OF_STOCK | 1034 | 1030 | 2182 |
| PREORDER | 1 | 0 | 1 |
| UNKNOWN | 1512 | 2491 | 0 |

Отсутствующий новый файл и возраст не меняют эти состояния. Quantity STATUS=null; ни `stockYes=5`, ни implicit stock=1 не используются. FEED_PRESENCE не назначается. Рабочие manual overrides не переопределялись.

## Второй слой — готовность конкретного PIM SKU

Для PAYMENT_READY виртуально проверены: policy-confirmed IN_STOCK, существующий реальный SKU, source_binding_status=CONFIRMED, подтверждённый применимый размер/NO_SIZE_REQUIRED, положительная рассчитанная цена и действующие margin guards. Numeric stock **не требуется** для принятого STATUS. Сеть, checkout, публикация и оплата не вызываются. Price calculations только читаются; цены/маржа не изменяются.

### Без двойного счёта

Приоритет: binding → size → payment/price → confirmation/request или недоступное availability. Каждый SKU принадлежит одной строке.

| Второй слой | Текущий dry-run | До подтверждения UKR-TEC | Tactical Belt QUANTITY условно |
|---|---:|---:|---:|
| PAYMENT_READY | 4915 | 4859 | 5242 |
| SIZE_CONFIRMATION_REQUIRED | 848 | 848 | 848 |
| BINDING_CONFIRMATION_REQUIRED | 626 | 626 | 626 |
| PRICE_CONFIRMATION_REQUIRED | 0 | 0 | 0 |
| ORDER_CONFIRMATION_REQUIRED | 0 | 0 | 0 |
| NOT_PAYMENT_READY_AVAILABILITY | 2345 | 2401 | 2018 |

### Независимые flags

- SIZE_CONFIRMATION_REQUIRED: **1446** SKU.
- BINDING_CONFIRMATION_REQUIRED: **626** SKU.
- Оба flags: **598** SKU.
- Поэтому после исключения binding cases остаётся **848** size cases в таблице без двойного счёта.

PAYMENT_READY — потенциальная готовность SKU по данным и принятым policies, **не разрешение production payment и не число опубликованных карточек**. Publication/архив/фото/описания проверяются отдельным слоем. 1145 size options без реального SKU из прежнего контрольного импорта не включены в эти 8734 real SKU и не становятся payable variants.

## Что применено

```text
WORKING_POLICY_WRITES = 0
QUANTITY_RECORDS_CREATED = 0
CATALOG_WRITES = 0
IMPORT_APPLY_CALLS = 0
PERSIST_CALLS = 0
PRODUCTION_WRITES = 0
SOURCE_INPUT_UNCHANGED = true
```

Рабочий runtime не переводился на новые inventory policies этим dry-run. После подтверждения semantics потребуется отдельно интегрировать inventory_mode в schema/export/mock checkout и import preview/apply, затем повторить весь control import + второй идентичный импорт и проверки losses/duplicates/manual locks. Остальные исходные задачи сохранены в TASKS.md. Production `/pim/sync` и автопрайсы остаются заблокированы.

## Повторение

```bash
node reviews/inventory-policy-final-dry-run-2026-10-08/payment-facts.cjs /private/classified-review-copy.json /tmp/payment-facts.json
python3 reviews/inventory-policy-final-dry-run-2026-10-08/analyze.py /private/baseline.json /tmp/payment-facts.json /tmp/inventory-dry-run
```

Первый script использует review runtime только для локальных расчётов size/binding/price и ничего не импортирует/не сохраняет. Facts с per-SKU sale prices остаются вне Git. Второй script пишет только aggregates и supplier examples, не рабочие данные. SHA исходного snapshot и классифицированной копии указаны в dry-run.json; файл input повторно проверен неизменным. Runtime HTML SHA записан как provenance локальной review-сборки, не как опубликованный production commit.
