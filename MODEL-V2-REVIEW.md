# MODEL → COLOR → SKU v2 — подготовленная PIM сборка

Исходники baseline 10.9.0 SIMPLE извлечены в `app/`; архивы `releases/` сохранены. Новая версия 10.10.0 добавляет независимый registry моделей/цветов/SKU, явный legacy mapping, приватный и public export, блокирующий dry-run и необязательный durable PIM-side API. Автоматическое объединение по названиям отключено.

Инструкция и границы реализации: [app/docs/MODEL-COLOR-SKU-V2.md](app/docs/MODEL-COLOR-SKU-V2.md).

```sh
cd app
npm ci --ignore-scripts
python3 -m pip install --target /absolute/helper-python -r tools/requirements-suppliers.txt
export PIM_SUPPLIER_PYTHON_PATH=/absolute/helper-python
npm run build
npm test
```

Предоставленная копия: 3 113 карточек / 8 734 SKU / 82 328 ссылок на фото; исходные данные сохранены. Mapping пока UNKNOWN, canonical IDs/старые URLs в копии отсутствуют. Получена полная текущая выгрузка сайта: 3 103 товара / 8 682 SKU / 19 025 строк фото, проверены все 9 табличных SHA-256. Подготовлен общий источник с quarantine; подтверждение группировок остаётся обязательным. Подробности: [SITE-RECONCILIATION-20261008.md](app/docs/SITE-RECONCILIATION-20261008.md). Сайт и действующие карточки этой сборкой не изменены.

Полные backup/source/mapping и закупочные данные находятся вне Git, в закрытой рабочей директории. В репозитории только код, синтетические тесты и агрегированные отчёты.

Получены все пять файлов поставщиков. Точные supplier-SKU связи подтвердились для 8 734 SKU; 3 884 site-only SKU остаются без сохранённой связи. Подготовлены кандидаты и список конфликтов, без автоматических merge/распределения фото. [Результаты сверки поставщиков](app/docs/SUPPLIER-RECONCILIATION-20261008.md). Проверки: 500 Node tests и 6 Python tests внутри suite, без skips. Это готовые инструменты и отчёты для review, не завершённая reclassification реального каталога.
