# Сверка пяти файлов поставщиков

Получены М Він XML, Tactical Belt YML/XML, Укр Тек XLSX, Армолайн XML и Кіборг XML. Разбор offline: исходники остаются закрытыми, PIM и магазин не изменены. Все 8 202 offer rows и исходные поля сохранены с SHA-256 и provenance. Закупочные цены, supplier IDs/SKU и photo URLs не входят в публичные отчёты.

| Поставщик | Строки offers | Явные supplier group IDs | Без группы | Числовые quantities | Несколько raw значений цвета |
| --- | ---: | ---: | ---: | ---: | ---: |
| М Він | 924 | 199 | 0 | 0 | 3 |
| Tactical Belt | 1 512 | 298 | 238 | 1 512 | 0 |
| Армолайн | 1 405 | 320 | 0 | 0 | 0 |
| Укр Тек | 447 | 0 | 447 | 2 | 0 |
| Кіборг | 3 914 | 1 935 | 0 | 0 | 385 |

2 752 supplier groups — **исходные группы поставщиков, не утверждённые 2 752 маркетинговые MODEL**. group_id иногда описывает цветовую/размерную семью. Связи цветов разных source groups нельзя объединять по имени товара. В XLSX Укр Тек ID_групи_різновидів отсутствует; Номер_групи — категория, её нельзя использовать как model_id.

## Подтверждённые связи

8 734 существующих PIM supplier links сопоставлены точно: supplier_id + настроенное первичное поле supplier_sku. XML использует vendorCode с исходным fallback на offer @id; XLSX — Унікальний_ідентифікатор согласно сохранённому profile. Нет отсутствующих или неоднозначных первичных связей. @id и vendorCode не взаимозаменяемы: перебор всех aliases создавал бы ложные совпадения.

7 517 SKU имеют явный supplier group_id; 1 217 сопоставлены с offer без группы. Исходные цены, stock, offers/costs и locks не переписывались. Несколько PIM SKU могут ссылаться на одну строку spreadsheet: это существующая сохранённая связь, а не разрешение схлопнуть SKU.

447 старых карточек связаны с несколькими supplier groups. Они отмечены MULTIPLE_SUPPLIER_GROUPS_REVIEW: требуется решить структуру MODEL/COLOR, не автоматически разделять или объединять. Три группы Tactical Belt пересекают текущие canonical categories: armor_soft/pouches_dangler, pouches_magazines/tools_multitools, clothing_vests/pouches_magazines. Старые canonical IDs сохранены; это очередь review, не разрешение переклассифицировать название regex-правилом.

В подготовленном union 3 884 site-only SKU не имеют сохранённого supplier link. Для всех 1 204 site-only карточек пересечение точных source photo URLs дало один supplier group candidate. У 43 карточек есть также точный article candidate, согласующийся с фото. Эти наблюдения **остаются UNKNOWN**: общий URL/группа ещё не подтверждает конкретный SKU, размер, цвет или redirect. Ни один supplier link этих 3 884 SKU не придуман. В private отчёте есть строки кандидатов для адресной сверки.

## Наличие, размеры и фото

1 514 quantities сохранены как наблюдения с исходным полем, включая нули. Это не текущие подтверждённые остатки. Даты XML: М Він 2026-04-08, Tactical Belt и Кіборг 2026-10-01, Армолайн 2026-09-24; в Укр Тек дата экспорта неизвестна. freshness_verified=false, quantity_verified_current=false. Источник без числового остатка не превращается в stock=0 или выдуманный stock=1.

Повторные color params с разными raw значениями сохранены полностью. Часть различий — перевод одного цвета (Сірий/Серый, Графит/Графіт), часть — разные обозначения (Хаки/Оливковый). Число в таблице означает несколько исходных значений, а не доказанные ошибки каждого товара. Цвет и gallery ownership остаются UNKNOWN; название и общий photo URL не используются для назначения фото цвету. Отдельно остаются 246 размерных расхождений PIM/site и 58 карточек во внутренней canonical категории из полной сверки.

## Повторяемый workflow

Python 3.12 и Node.js 22+. Установить закреплённые зависимости вне web root:

```sh
python3 -m pip install --target /private/helper-python -r tools/requirements-suppliers.txt
PYTHONPATH=/private/helper-python python3 tools/parse-supplier-feeds.py \
  --bindings /private/bindings.json \
  --output-dir /private/new-feeds
node tools/reconcile-suppliers-v2.cjs \
  --source /private/prepared/source.private.json \
  --feeds /private/new-feeds/feeds.private.json \
  --output /private/new-supplier-report.json
```

bindings.json — закрытый массив {supplier_key, supplier_id, file, sku_field}; supplier_id берётся из существующей cfg, не создаётся из названия. file — локальный файл, никакой сетевой загрузки parser не делает. sku_field нужен для XLSX. Outputs создаются вне application/web root, 0700/0600, без перезаписи. При обработке XML запрещены entities и external entity resolution; стандартная YML декларация shops.dtd не загружается. XLSX formulas не выполняются, VBA и чрезмерно большие архивы отклоняются.

500/500 Node tests без skips; suite включает 6 Python parser tests. Проверены XXE, неоднозначный primary SKU, невозможность группировки по title/category, сохранение количественного нуля, raw color conflicts, spreadsheet characteristics и неподтверждённые site-only candidates. LOST counters union по-прежнему все 0; ready_for_migration=false. Успешное чтение файлов и подтверждение supplier links не равно завершённой reclassification.

Следующий этап: решить перечисленные review cases в registry, подтвердить каждую связь SKU и color/photo ownership, получить свежие availability/quantity observations, повторить полный dry-run. Только после этого подключать shop batch application и kit engine. Для текущего рабочего магазина установка не выполнялась.
