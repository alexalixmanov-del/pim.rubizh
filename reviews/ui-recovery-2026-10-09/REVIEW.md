# PIM 10.9.3 — исправление блокеров установки

Установка `27fb26056563eb1fcf144ffdb2ba9ab264fa9313` остановлена. Пользователь выполнил rollback; публичный index.html снова совпадает с прежней PIM 10.9.0 по SHA256. Миграция данных на хостинге не запускалась. Повторная установка исправленного архива требует подтверждения нового commit; прежний архив сохранён без изменений.

Обнаружены две независимые причины: реальный UI-блокер и открытие PIM в другом профиле Chrome. Экран миграции заменял #main, удаляя #view и поиск; второй render() падал. Другой профиль/инкогнито имеет отдельный IndexedDB и настройки входа: ноль товаров там не доказывает потерю исходной базы. Пользователь подтвердил использование другого профиля.

Исправлены только найденные блокеры:

- Экран миграции и панель rollback меняют содержимое #view; #main, поиск и постоянная оболочка сохраняются. Ошибка авторизации также не удаляет оболочку.
- Пустой профиль получает понятное сообщение; preview отключён при отсутствии товаров. Серверное восстановление остаётся явным действием. Никакого автоматического создания/перезаписи каталога.
- Удалены ошибочные RC title/banner, описывавшие production как локальную тестовую копию.
- Обязательный action установщика задаётся способом, совместимым с argparse Python 3.6. Install/rollback и проверка checksum не изменены.

Категории, size catalogs, inventory policies, исключения, manual locks, prices/stock и правила order/payment не изменялись. DATA_MIGRATION не менялась. SYNC_ENABLED=false, AUTOPRICES_ENABLED=false в исправленной сборке. Tactical Belt остаётся UNKNOWN. В тестах настоящие API магазина, Supabase и поставщиков не вызываются.

## Проверка

Реальный Chromium сначала воспроизвёл падение исходного релиза. Затем проверяется полный HTML/startup исправленной сборки без заглушек render(), в отдельной IndexedDB на loopback origin. Полная предоставленная копия загружается до запуска PIM; preview/apply нажимаются настоящими кнопками, backup действительно скачивается, подтверждение проходит штатным browser dialog. Проверяются поиск, товары, категории, поставщики, backup, настройки и импорт при ширине 1440/390, перезапуск, повторная migration и rollback с rescue backup.

Предыдущие data-тесты подавляли render() и не исполняли bootstrap. Это было недостаточной проверкой интерфейса; добавлены DOM-регрессии в обязательный npm test и отдельный полный Chromium smoke.

Контроль данных на копии: 3113 products, 8734 SKU/variants, 143 categories; LOST_CATEGORIES/SKU/VARIANTS/PHOTOS/PRICES/STOCK=0, новые duplicates=0; 8 manual-lock products сохранены. Защищённый hash до/после: eb1fdbb9b6792e7eb6c0df610e9c78007175472783ad3eb4708d9ba441551a61. Повторная migration: 0 writes, 0 новых backup. Rollback/rescue прошли. Это результаты копии, не проверка живого IndexedDB пользователя после rollback.

607 обязательных Node-тестов, 49 size/business-тестов и 12 installer-тестов прошли. Все 12 installer-тестов также прошли с оригинальным модулем argparse CPython 3.6.15 под текущим Python; это проверка старого API argparse, а не утверждение о запуске полного Python 3.6. На хостинге ранее проверены неизменённые install/rollback функции под Python 3.6.8.

## Артефакты и воспроизведение

- `release-summary.json`: безопасная сводка контрольной миграции, без поставщицких строк, ключей или приватной базы.
- `browser-report.json`: результат полного Chromium smoke; `frozen-startup-repro.json`: воспроизведение старой ошибки.
- `rollback-verification.json`: read-only HTTP-проверка восстановленного production index.
- `../../releases/pim-10.9.3/rubizh-pim-10.9.3-ui-recovery.zip`: отдельный исправленный архив. Исходный production.zip не перезаписан.

Для полного browser smoke нужны Chromium и playwright-core. Пример для настроенного cloud environment:

```sh
PIM_SOURCE=/absolute/private/backup.json \
PIM_PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
PIM_CHROMIUM=/usr/bin/chromium \
PIM_BROWSER_REPORT=/absolute/private/browser-report.json \
node --max-old-space-size=6144 reviews/ui-recovery-2026-10-09/browser-smoke.cjs
```

Без PIM_SOURCE проверяется пустой профиль. Для воспроизведения исходного падения добавить PIM_REPRO=1 и PIM_HTML=/absolute/frozen/index.html.

Установщик проверять именно на новом архиве, не перезаписывая принятый старый пакет:

```sh
PIM_TEST_ARCHIVE="$PWD/releases/pim-10.9.3/rubizh-pim-10.9.3-ui-recovery.zip" \
python3 app/tests/production-installer.test.py
```

## Следующая установка

Сначала подтвердить исправленный commit. Затем в исходном профиле Chrome снова проверить сохранение/pending=0 и совпадение live-state с проверенной копией. Если состояние изменилось — новый full backup и preview. Не очищать browser storage и не восстанавливать backup поверх непроверенных данных. Сохранить прежние runtime и полный backup вне webroot, установить проверенный архив, проверить HTTP checksum и полный browser startup до migration. Проверить preview в исходном профиле (3113/8734 либо повторно согласованный актуальный baseline), затем backup/apply и все invariants. Любое отличие — остановка и rollback.

Публичное восстановление файлов не подтверждает текущие data-counts/manual locks пользователя. В 10.9.0 после rollback нельзя считать прежнюю автосинхронизацию отключённой постоянно: пока держать вкладки PIM закрытыми. В новой сборке shop sync и автопрайсы выключены независимо от старой настройки.
