# PIM РУБІЖ — финальный dry-run категорий

Дата: 2026-10-08. Замороженная база 10.9.2. Выполнено только планирование по принятому решению владельца.

**Ничего не применено.** Production, рабочая taxonomy, cfg, товары, связи, aliases и supplier mappings не изменены. Миграция, публикация и массовые переносы не запускались.

## Итог

| Область | SAFE_AUTO | LIKELY | AMBIGUOUS |
|---|---:|---:|---:|
| Исходные 124 случая после финального виртуального пересчёта | 109 | 12 | 3 |
| Вся очередь из 316 вопросов категорий | 243 | 70 | 3 |

```text
CATEGORY_SAFE_AUTO = 243
CATEGORY_LIKELY = 70
CATEGORY_AMBIGUOUS = 3
```

243 = 134 прежних SAFE_AUTO + 109 результатов этого dry-run; 70 = 58 прежних LIKELY + 12 текущих; AMBIGUOUS = 3 текущих противоречия комплектации. Прежние 134 SAFE_AUTO и 58 LIKELY перенесены в сводку без повторной классификации.

По сравнению с предыдущим разбором 124 вопросов: SAFE_AUTO 70 → 109, LIKELY 33 → 12, AMBIGUOUS 21 → 3. **39 дополнительных вопросов имеют безопасное предлагаемое решение**, но ни один товар ещё не перенесён.

По всей исходной базе из 3113 товаров проверены заголовочные кандидаты одобренных типов: все они находятся внутри этих 124. Дополнительных кандидатов этих типов вне охваченной выборки не найдено. Это проверка охвата по правилам заголовка, а не новая полная классификация всех товаров.

## Categories before / after

| Область | categories_before | categories_after |
|---|---:|---:|
| Рабочие данные, фактически | 134 | 134 |
| Отдельная виртуальная taxonomy dry-run | 134 | 143 |

В памяти создана отдельная структура taxonomy для расчёта; она не присвоена в cfg и не загружена в приложение. `taxonomy-virtual.json` в этой папке — **артефакт отчёта, не рабочий справочник и не файл для импорта**.

## Одобренные новые IDs

| ID | Название | Parent category | Товаров в выборке | SAFE_AUTO / LIKELY / AMBIGUOUS |
|---|---|---|---:|---|
| `symbols` | Символіка | Корень (`null`) | 0 напрямую, 8 в дочерней категории | 0 / 0 / 0 |
| `armor_ballistic_blankets` | Балістичні ковдри | `armor` | 2 | 2 / 0 / 0 |
| `clothing_insulated_vests` | Утеплені жилети | `clothing` | 2 | 2 / 0 / 0 |
| `footwear_care` | Догляд за взуттям | `footwear` | 2 | 2 / 0 / 0 |
| `footwear_shoes` | Туфлі та лофери | `footwear` | 1 | 1 / 0 / 0 |
| `communications_earplugs` | Пасивні беруші | `communications` | 2 | 1 / 1 / 0 |
| `electronics_rf_detectors` | Детектори радіосигналів та РЕР | `electronics` | 1 | 1 / 0 / 0 |
| `symbols_flags` | Прапори | `symbols` | 8 | 8 / 0 / 0 |
| `field_watches` | Польові та тактичні годинники | `field_gear` | 27 | 27 / 0 / 0 |

`footwear_loafers` отсутствует в финальном плане. Он никогда не был существующим canonical ID, поэтому замена предложения на `footwear_shoes` **не является удалением или переименованием действующей категории**.

## Evidence для часов

**27 самостоятельных товаров watch/годинник → SAFE_AUTO в виртуальную field_watches.** Требуются исходные supplier titles, подтверждающие само изделие, и независимые сведения поставщика о циферблате, механизме или функциях времени. Только похожее название или раздел «Годинники» не являются достаточным основанием.

Утверждённая владельцем область категории — подтверждённый тип watch/годинник. Она не доказывает военную сертификацию, противоударность, пригодность для погружения или другие свойства каждой модели.

Секундомер Flotti F018 остаётся LIKELY с предлагаемым существующим field_other: самостоятельный секундомер не подменяется наручными часами. Ремешки, чехлы и зарядники часов также не распознаются как самостоятельный watch по слову в назначении.

## Остаток спорных случаев

**12 LIKELY + 3 AMBIGUOUS = 15 товаров из исходных 124**, объединённые в 10 групп supplier + rule.

| Уверенность | Поставщик | Товаров | Предлагаемая категория | Причина |
|---|---|---:|---|---|
| LIKELY | укр тек | 2 | `weapon_slings` | Точечный ремень и оружейная supplier group согласуются, но SKU-level описание крайне короткое; одного раздела поставщика недостаточно. |
| LIKELY | тактикал белт | 1 | `field_other` | В taxonomy есть общий полевой раздел. Нужно одно решение о допустимости такого раздела для часов, включая городские модели; это не доказанный пробел. |
| LIKELY | м вин | 1 | `clothing_headwear` | Комплект шапка+баф: обе существующие категории подходят компонентам. Утвердить основную категорию комплекта один раз. |
| LIKELY | тактикал белт | 1 | `communications_earplugs` | Пассивные беруши определены, но EARMOR в исходном названии и MaxDefense в описании не согласованы; исключение не закрывается принудительно. |
| LIKELY | укр тек | 2 | `clothing_belts` | Недостаточно конструкции, чтобы исключить разгрузочный пояс; поставщик использует общее название. |
| LIKELY | тактикал белт | 2 | `field_other` | Изделие определено как ловушка. Общий полевой раздел возможен, но описание говорит о помещениях; требуется одно решение о пределах общего раздела. |
| LIKELY | киборг | 1 | `helmets_accessories` | IFF-маячок крепится не только к шлему; согласовать шлемный аксессуар или общий световой прибор. |
| LIKELY | киборг | 1 | `field_sleeping_bags` | Многофункциональный мишок-пончо: реальные функции сна и одежды конкурируют. Достаточно одного решения для семейства. |
| AMBIGUOUS | киборг | 3 | `armor_accessories` | Название: комплект с защитой. Описание: чехол под пакет/возможность покупки отдельно. Нет однозначного SKU-level состава. |
| LIKELY | армолайн | 1 | `clothing_headwear` | Комплект шапка+баф: обе существующие категории подходят компонентам. Утвердить основную категорию комплекта один раз. |

В taxonomy теперь есть виртуальная категория для пассивных берушей, но исходный товар **EARMOR M-02 имеет описание MaxDefense NRR36**. Этот вопрос оставлен LIKELY, warning SOURCE_MODEL_MISMATCH сохранён. Одобрение taxonomy не исправляет идентичность модели.

Три AMBIGUOUS — комплекты защиты живота Kiborg/Militex: название указывает комплект, описание содержит чехол под пакет/возможность отдельной покупки. Без SKU-level подтверждения состава нельзя выбрать безопасную окончательную категорию.

Вне одобренных профильных категорий скрипт проверяет, что все прежние tier и предлагаемые категории остались прежними: вопросы не закрывались принудительно.

Полный короткий список: [grouped-exceptions.json](grouped-exceptions.json). Доказательства и изменения tier по каждому товару: [results-124.json](results-124.json).

## Aliases и supplier rules — только виртуальный план

**25 предлагаемых aliases, 13 условных supplier rules.** Ничего не записано в рабочие dictionaries/cfg. Корень symbols не классифицирует товары напрямую и не получает supplier mappings.

Правила действуют только для подтверждённого типа самого изделия: совпадение исходного названия и независимое описание. Общий supplier section не переназначается целиком. Ручные блокировки и существующие подтверждённые mappings сохраняют приоритет.

Предлагаемые supplier rules — review-формат с условиями проверки, не готовые записи рабочего импорта.

### symbols

Aliases: нет.

Supplier rules:
- Нет; родительский корень не используется для маршрутизации товаров.

### armor_ballistic_blankets

Aliases: `бронековдра`, `баллистическое одеяло`.

Supplier rules:
- киборг / `2 клас захисту` → `armor_ballistic_blankets`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.
- киборг / `1 клас захисту` → `armor_ballistic_blankets`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.

### clothing_insulated_vests

Aliases: `утеплена жилетка`, `жилетка утеплена`, `утепленный жилет`.

Supplier rules:
- армолайн / `Жилетки утеплені` → `clothing_insulated_vests`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.
- укр тек / `Voennaya forma` → `clothing_insulated_vests`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.

### footwear_care

Aliases: `спрей для взуття`, `догляд за взуттям`, `крем для обуви`.

Supplier rules:
- укр тек / `Krem dlya obuvi` → `footwear_care`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.
- укр тек / `Zaschitnye pokrytiya` → `footwear_care`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.

### footwear_shoes

Aliases: `лофери`, `лоферы`, `туфлі`, `туфли`.

Supplier rules:
- укр тек / `Tufli` → `footwear_shoes`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.

### communications_earplugs

Aliases: `пасивні беруші`, `беруші багаторазові`, `беруши пассивные`.

Supplier rules:
- тактикал белт / `Навушники , беруши` → `communications_earplugs`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.

### electronics_rf_detectors

Aliases: `пристрій радіоелектронної розвідки`, `детектор радіосигналів`, `детектор fpv`.

Supplier rules:
- киборг / `Електронна боротьба та розвідка РЕБ та РЕР` → `electronics_rf_detectors`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.

### symbols_flags

Aliases: `прапор України`, `флаг Украины`.

Supplier rules:
- тактикал белт / `ПРАПОРА` → `symbols_flags`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.
- м вин / `Державні прапори України` → `symbols_flags`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.

### field_watches

Aliases: `годинник наручний`, `наручний годинник`, `тактичний годинник`, `наручные часы`, `wristwatch`.

Supplier rules:
- тактикал белт / `Тактичні годинники` → `field_watches`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.
- тактикал белт / `Годинники GLOCK` → `field_watches`: только CONDITIONAL_WHOLE_ITEM_RULE, supplier title + description evidence. Без перезаписи существующего mapping.

## Taxonomy diff

Фактически: new_category_ids = []; removed_category_ids = []; renamed_category_ids = []; moved_category_ids = []; alias_changes = []; supplier_mapping_changes = [].

Виртуально: new_category_ids = девять IDs из таблицы выше; removed_category_ids = []; renamed_category_ids = []; moved_category_ids = []. Все 134 действующих записи, включая имена, родителей и aliases, скопированы без изменения. Только виртуальные новые категории имеют новые aliases и условные supplier rules.

Полный фактический/виртуальный diff: [taxonomy-diff.json](taxonomy-diff.json).

## Сохранность

```text
LOST_CATEGORIES = 0
LOST_SKU = 0
LOST_VARIANTS = 0
products: 3113 → 3113
SKU entries / variants: 8734 → 8734
working taxonomy: 134 → 134
```

SHA-256 всей products и всей cfg совпадают до/после. Так проверена неизменность фото, цен, остатков, supplier offers, SKU, variants, истории, ручных блокировок и действующих canonical IDs. Все входные файлы также имеют прежние SHA-256. Working taxonomy файла приложения побайтно совпадает с прежним taxonomy-before.json.

Исходная база: `9ee5645236db92e5373dea1a875a83d821ec86bab64f4acc1e4316b7183ee5f3`.

Это доказательство неизменности read-only dry-run; будущая применённая миграция потребует собственной проверки before/after. Исторические цены/остатки не обновлялись и не переобъявлялись актуальными.

Сводка: [summary.json](summary.json). План: [approved-category-plan.json](approved-category-plan.json). Виртуальная taxonomy: [taxonomy-virtual.json](taxonomy-virtual.json).

Проверки: **78 тестов новых правил/изоляции и 261 существующий тест прошли**, failures = 0. Existing tests: categories, product-model, queue-reduction. Логи: [tests-new.txt](tests-new.txt), [tests-existing.txt](tests-existing.txt).
