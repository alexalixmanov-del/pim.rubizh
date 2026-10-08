# Полный результат сверки, 8 октября 2026

Рабочий магазин не изменён. Apply, публикация и автоматическое объединение старых карточек не выполнялись. Предыдущий commit сверки находится в **PIM repo**, а не в main магазина: [a0b3c3c](https://github.com/alexalixmanov-del/pim.rubizh/commit/a0b3c3c0a805df45ee6ca54fe00d27e587051fab).

Этот review содержит полные строки, а не только сводные цифры. [Скачать весь отчёт ZIP](review-evidence.zip). JSON больше лимита GitHub preview открывается через Raw; ZIP включает те же файлы и контрольные суммы.

| Запрошенный результат | Файл | Что подтверждено |
| --- | --- | --- |
| 8 734 supplier SKU | [confirmed-supplier-skus.json](confirmed-supplier-skus.json) | Supplier-scoped exact configured primary SKU; field, offer ID, file/offer SHA, row selector; свежесть остатков не подтверждена |
| 3 884 site-only SKU | [site-only-skus.json](site-only-skus.json) | Каждый SKU, кандидаты offer/group, photo/article/color/size/barcode evidence и качественный confidence; все UNKNOWN и stock_confirmed=false |
| 447 конфликтных карточек | [conflict-cards.json](conflict-cards.json) | Полный список, источники, признаки, противоречия и классификация |
| MODEL → COLOR → SKU dry-run | [model-color-sku-dry-run.json](model-color-sku-dry-run.json) | 4 317 UNKNOWN placeholders, 12 618 сохранённых SKU, colors пусты до доказательства ownership |
| Old product / SKU mapping | [legacy-mapping-review.json](legacy-mapping-review.json) | Каждый старый product/SKU и устойчивые provisional model/variant IDs; color_id=null, UNKNOWN; не готовый apply bundle |
| Что проверяют тесты | [tests-report.json](tests-report.json) | Название, файл, строка и результат каждого из 500 core и 12 новых review tests |
| Before/after, LOST и блокировки | [final-summary.json](final-summary.json) | Сводка и SHA всех закрытых исходников |

## Разбор 447 карточек

**17 SAFE_AUTO, 252 LIKELY, 178 AMBIGUOUS.** Отдельные списки: [SAFE_AUTO.csv](SAFE_AUTO.csv), [LIKELY.csv](LIKELY.csv), [AMBIGUOUS.csv](AMBIGUOUS.csv). Полные нормализованные значения подтверждённых/спорных характеристик и основания находятся в JSON. CSV безопасен при открытии в spreadsheet; JSON сохраняет точные исходные строки.

447 означает несколько supplier **groups** на одну старую карточку общего source. 148 таких карточек есть в текущем сайте, 299 — только в PIM. Несколько разных supplier identities имеет **одна** карточка. Поэтому MULTI_SUPPLIER_CONFLICTS=1, MULTI_GROUP_CONFLICT_CARDS=447. Прежнее название счётчика «multi-supplier» было неточным.

SAFE_AUTO ограничен планом консолидации supplier groups внутри **одной существующей** legacy карточки. Алгоритм не строит транзитивные объединения разных карточек. Все links должны быть exact; бренд и supplier category совпадают, отсутствуют противоречия характеристик/canonical category и коллизии цвета/размера. Дополнительно требуется явный manufacturer model/SKU family с suffix, проверенным по variant fields, плюс минимум две полностью совпадающие характеристики; либо точный существенный supplier technical description, точный name frame без записанных color/size и минимум три полностью совпадающие характеристики. Название, общая категория или одинаковое описание отдельно недостаточны. Blueprint не подтверждает доступность, gallery ownership, корректность категории или готовность всей MODEL к публикации.

LIKELY — candidate review с независимыми структурными признаками, но без достаточной совокупности для SAFE_AUTO. AMBIGUOUS — реальные противоречия или недостаточность идентичности. Confidence — правило/категория evidence, **не выдуманная статистическая вероятность**. Цель 30–50 неоднозначных случаев по текущим файлам не достигнута; границы не подгоняются под число. Весь короткий перечень карточек и причин доступен в CSV, без необходимости повторно исследовать сырой каталог.

SAFE_AUTO означает eligibility offline плана после review, а не выполненный merge. AUTO_CONFIRMED_MERGES=0, safe_plans_applied=0; реальный registry остаётся UNKNOWN. Остальные 430 из этой группы требуют решения (252 вероятных + 178 неоднозначных); для полного каталога остаются и другие неподтверждённые MODEL/COLOR/SKU связи.

## Сохранность и наличие

MODELS_BEFORE=MODELS_AFTER=4 317 — **эквиваленты старых карточек / placeholders**, не утверждённые маркетинговые модели. CONFIRMED_MODELS_AFTER=0. SKU_BEFORE=SKU_AFTER=12 618. Источник объединяет 8 734 PIM SKU и 8 682 site SKU с пересечением 4 798. Все LOST_SKU/VARIANTS/PHOTOS/PRICES/STOCK/CATEGORIES=0; 101 353 photo references сохраняются в закрытом source. Photo mapping fingerprint присутствует в review, сами галереи не распределены по цвету.

Нулевые LOST — доказательство сохранения данных при подготовке UNKNOWN registry, не подтверждение фактического наличия. Все site-only SKU остаются SITE_ONLY_UNRESOLVED=3 884. Присутствие товара на сайте не является stock evidence. Кандидаты сверены с присланными offer files; XML датированы апрелем/сентябрём/1 октября, дата XLSX неизвестна. quantity_verified_current=false. Нужны свежие feeds/остатки для проверки доступности; уже полученные файлы повторно запрашивать не нужно.

Отчёт фиксирует реальный blocked dry-run: ready_for_migration=false. Нулевые ошибки формы не означают разрешение на apply. Тесты проверяют код на синтетических fixtures, а не доказывают каждую реальную группировку или нагрузку магазина. Все 500 core прошли повторно; ещё 12 проверяют новый алгоритм, review projection и защиту CSV. Шесть Python parser checks входят в core suite как одна Node проверка, не добавляются ещё раз к числу 500.

## Повторение и откат

Из app/: npm test, npm run test:review. tools/export-review-evidence-v2.cjs принимает --source, --mapping, --feeds и новый --output-dir; manifest фиксирует точные SHA-256 закрытых входов. Код не меняет production или текущий registry. Полный private source, mapping с photo IDs и сырой supplier cost архив остаются вне Git. Review-проекция не заменяет резервную копию БД/PIM и не должна использоваться как apply payload. Откат этого этапа — смена review-кода/возврат прежнего registry; рабочие данные не мигрировались.

В GitHub включены только разрешённые владельцем SKU/evidence review, публичные retail values, код и тесты. Ключи, закупка, контакты покупателей и полные backup inputs исключены. evidence-manifest.json содержит SHA каждого артефакта; ZIP включает README и этот manifest.
