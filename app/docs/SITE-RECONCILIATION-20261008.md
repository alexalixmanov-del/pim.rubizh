# Полная сверка PIM и текущего магазина

Получен read-only snapshot сайта, созданный 08.10.2026 в 21:15:55 по Киеву. SHA-256 JSON: `3698266ba71ce0fa8e9b687aa0b755326aea9ef1a2380a0357d7abac4aa9c4a6`; совпал с результатом WebSSH. Проверены все 9 табличных fingerprint. Контрольные суммы canonical-taxonomy.json и category-directory.2026100802.js совпали с текущим shop repo. Перенос в production не выполнялся.

| Данные | PIM от 4 октября | Текущий сайт | Точно совпали |
| --- | ---: | ---: | ---: |
| Старые ID карточек | 3 113 | 3 103 | 1 899 |
| SKU и их product owner | 8 734 | 8 682 | 4 798 |

Сайт содержит 1 204 карточки / 3 884 SKU, отсутствующих в копии PIM. Копия PIM содержит 1 214 карточек / 3 936 SKU, отсутствующих в сайте. Девять из отсутствующих на сайте SKU относятся к одной карточке, чей product ID совпал. Остальные расхождения нельзя объяснять или устранять по названиям. Отсутствие в другом источнике не означает разрешение на DELETE/HIDE.

У 4 798 совпавших SKU нет конфликтов product owner, цен, цвета, штрихкода и исходного supplier availability. Проверено именно 4 798 цен; формат числа с завершающими нулями не создаёт ложного расхождения. Числовые остатки отсутствуют в обеих системах: stock_compared = 0, stock_unknown_both = 4 798. Нулевой stock_differences означает совпадение отсутствующих значений, а не подтверждённое наличие. Истёкший supplier availability в v2 также отмечается availability_unknown; устаревшее предложение не доказывает OUT_OF_STOCK.

У 246 общих SKU различается значение размера. Значения PIM и site size_native/size_letter/size сохранены отдельно. Исправление не выбирает автоматически одну сторону и не нарушает исходные size locks.

## Taxonomy и URL

Сохранены все 137 canonical записей (136 active, 1 internal), 3 103 product-category связи, 348 старых категорий и 348 aliases. Все product canonical ID существуют и являются leaf. Старые product URL извлечены из сохранённых slug, никогда из названий; дубликатов slug нет.

58 карточек находятся во внутренней категории. Их связи сохранены, но публикация CONFIRMED модели из internal/inactive категории заблокирована CATEGORY_NOT_PUBLIC. Прямых таблиц rubizh_category_decisions и rubizh_supplier_category_rules в этой выгрузке нет; это отражено как отсутствие таблиц, а не как доказательство отсутствия locks. Доступные raw relation metadata, PIM locks/config и taxonomy assets сохранены.

## Фото

В БД 19 025 photo rows: 75 ok с файлами, 18 948 pending, 2 error (источник ответил HTTP 404). Выгрузка сообщила 75 читаемых локальных photo IDs, по одному у 75 карточек. Это состояние очереди/файлов в момент snapshot; оно не доказывает, что остальные внешние URL не могут показываться браузером, и не является live проверкой обработки очереди.

10 756 строк фото сайта точно совпали с PIM по product ID + исходному URL. У остальных 8 269 такой связи нет. Старые DB photo ID, позиции, src_url, src_hash, file/thumb/status и все PIM photo references сохраняются. Совпадение URL без совпадения владельца не подтверждает связь. Ни один цвет фото не назначен догадкой: color_id = null, mapping_status = UNKNOWN.

## Подготовленный общий source

```sh
node tools/reconcile-site-v2.cjs \
  --pim-source /private/pim/source.private.json \
  --site-source /private/site/site-source.json \
  --output /private/new-reconciliation.json \
  --prepare-dir /private/new-prepared-directory
```

CLI принимает полный проверенный snapshot и создаёт новый закрытый source, UNKNOWN registry и отчёт dry-run. Частичный публичный каталог, повреждённые fingerprint, конфликты владельцев/подтверждённых canonical ID и ошибочный graph отклоняются. Повторное создание не перезаписывает существующие файлы.

Общий source содержит 4 317 исходных карточек, 12 618 SKU и 101 353 ссылки на фото из обеих систем. Это архив и шаблон для review, **не будущие 4 317 опубликованных моделей**. Для точных ID добавлены текущие canonical ID/URL и site provenance; PIM-only и site-only записи не потеряны и не объединены. Все прежние supplier offers/costs/locks сохранены в private source. Для 3 884 site-only SKU supplier links в выгрузке отсутствуют: оставлены UNKNOWN, закупочные условия не придуманы. Исходные PIM categories сохранены в taxonomy_state отдельно от текущей site taxonomy.

Dry-run: все LOST_SKU/VARIANTS/PHOTOS/PRICES/STOCK/CANONICAL_CATEGORIES/SUPPLIER_LINKS = 0, errors = 0, но 21 252 model/product/variant mappings остаются непроверенными, color groups = 0, ready_for_migration = false. Публичный export пуст и явно publication_blocked. Нулевые LOST означают сохранность исходников, не завершённую reclassification/группировку или подтверждённые quantities.

## Следующие обязательные данные и работа

Получены все пять supplier files и выполнена их offline сверка: [SUPPLIER-RECONCILIATION-20261008.md](SUPPLIER-RECONCILIATION-20261008.md). Файлы подтвердили 8 734 существующих supplier-SKU связей и дали отдельные review-кандидаты для site-only карточек. Они не подтверждают свежесть наличия и не превращают группы поставщика автоматически в маркетинговые модели. Следует подтвердить supplier identity/SKU новых карточек и MODEL/COLOR связи. Затем разрешить internal категории, размерные расхождения и ownership галерей, повторить полный validator. Никакого автоматического merge одинаковых названий или удаления старых SKU.

Только после подтверждённого registry возможно подключение shop batch API и новый kit engine поверх корректных данных. Текущие shop cards, цены, заказные и пользовательские таблицы не изменены.

500/500 тестов прошли без skips. Новые проверки покрывают реальные обнаруженные ограничения: null stock, decimal formatting, tampered snapshots, taxonomy conflicts/cycles, сохранность union/quarantine, photo owner и запрет публикации internal категории. Полные source/mapping/report и приватные offer данные хранятся вне Git; в verification опубликованы только агрегаты.
