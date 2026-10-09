# PIM 10.9.3 production release — отчёт для проверки

Release подготовлен на основе принятого RC `440aa60ee42795ba8bf5167d8121470a5a56aab3`.
**На хостинг ничего не установлено. Production PIM / магазин / supplier feeds не изменялись.**

`SYNC_ENABLED = false`, `AUTOPRICES_ENABLED = false`, `PRODUCTION_WRITES = 0`.
Эти значения PRODUCTION_WRITES относятся к выполненным контрольным прогонам:
все записи происходили только в изолированной fake IndexedDB. Будущая реальная
migration, после отдельного подтверждения, запишет изменения локальной PIM и
поставит их в обычную очередь синхронизации сервера PIM. Sync **магазина** отключён.

## Источники и предел проверки

Основной прогон выполнен на JSON, полученном по предоставленной владельцем
Drive-ссылке `1rCXINwuwidDEXjhdsKYwzGdGAq6dYxVv`. Размер 86 431 395 байт,
SHA256 `eb3604fd349bc062a920127649beb6f9d52d4ab5335040a993487ae8978bc5be`.
Внутренние метки: `pimVersion=10.1.3`, `at=2026-10-04T17:42:10.606Z`.
Публичный HTML хостинга, полученный только GET-запросом, имеет версию 10.9.0
и SHA256 `9ad5e483465ce1e1878bf433d50ee5ae9606e60be4cfcacac64a559db27d64ef`.
Это несовпадение явно зафиксировано: актуальность browser/backend live state
не подтверждена. Результаты ниже доказывают переход **предоставленного снимка**,
а не выполненную миграцию текущей удалённой базы.

Дополнительно полный backup → migration → повтор → rollback выполнен на
нормализованной RC-копии. Она проверяет сохранность всех существующих 143
категорий, size catalogs, exceptions и manual locks. Обе копии содержат
3 113 товаров и 8 734 SKU/варианта/supplier bindings. Оригиналы не перезаписывались.

## PRODUCTION_MIGRATION_PLAN

1. В прежней PIM синхронизировать изменения сервера и получить полную текущую
   копию с документами. Закрыть остальные вкладки. Этот шаг особенно необходим
   при наличии более свежих данных, чем в присланном снимке.
2. После отдельного подтверждения владельца installer проверяет пакет и full
   backup, сохраняет прежние runtime files + data backup вне webroot, затем
   заменяет runtime files, index.html последним. Браузерную/серверную базу CLI
   не меняет. Инсталляция ещё **не выполнена**.
3. На том же домене/в том же браузере читается прежняя IndexedDB
   `rubizh_pim_v7_launch`; новая пустая база не подменяет прежний каталог.
   При pending migration первый запуск не выполняет автоматическую починку,
   изменение цен, language/category/model startup migration или cloud pull/push.
4. Пользователь смотрит dry-run **фактической текущей локальной базы**.
   Применение требует полного snapshot с SHA256/readback в backup IndexedDB,
   внешнего файла и отдельного подтверждения, что файл сохранён на диск.
5. В одной readwrite transaction повторно сравнивается полное исходное KV
   состояние, затем записывается candidate. Изменения другой вкладки / ошибка
   backup / отказ сохранить файл прекращают применение. Readback сравнивает
   защищённые значения и candidate; ошибка возвращает точное исходное KV.
6. После успешной миграции доступны обычные изменения PIM, локальные импорты
   preview → apply и существующая серверная PIM синхронизация с CAS. Магазин и
   URL-fetch/планировщик автопрайсов остаются заблокированными кодом.

В пустом браузере при существующем подключении разрешён **явный** read-only
server pull в пустую локальную базу без pending edits. Он не мигрирует и не
записывает удалённую базу. При отсутствии подключения можно восстановить
полную копию через отдельную same-origin recovery страницу, затем получить
migration preview. Непустую локальную базу этим действием заменить нельзя.

## FILES_CHANGED_FROM_RC

Полный список — [files-changed-from-rc.json](files-changed-from-rc.json).
Рабочие изменения:

| Файл | Назначение |
|---|---|
| `app/rubizh_pim.html` | Release 10.9.3, прежняя production namespace/auth keys, assembled controlled migration |
| `app/lib/classification-ui.inc.js` | Production channel; обычный PIM network разрешён, `/pim/sync` и bulk publication policy заблокированы |
| `app/lib/production-ui.inc.js` | Read-only startup, migration preview/apply, preserved-data assertions, idempotence, backup/rollback UI, operational gates |
| `app/lib/release-storage.js` | Atomic snapshot/CAS write, SHA256, binary-safe full archive, backup database, restore/rollback |
| `app/release-recovery.html` | Независимое восстановление данных, rescue backup, stale-source/readback проверки |
| `app/tools/install-production.py` | Backup прежних файлов + данных вне сайта, verified file install и rollback |
| `app/tools/package-production.py` | Reproducible allowlist package + manifest |
| `app/tools/build.cjs` | Подключение release module к сборке |
| `app/PRODUCTION-INSTALL.md` | Конкретная процедура установки и двухступенчатого rollback |

Остальные изменения — version/script metadata, harness, tests, audit runner и
release reports/package. Пользовательский root README не включён в commit.

Бизнес-файлы RC **побайтово неизменны**: category evidence, size evidence,
inventory policy, canonical taxonomy/rules, pricing, product model, kits,
export schema. Проверки SHA256 — [release-verification.json](release-verification.json).
Архитектура MODEL → COLOR → SIZE/SKU и order/payment permissions не менялись.

## DATA_MIGRATION

- Добавляются только отсутствующие approved canonical IDs, accepted policy
  defaults и category/size metadata из принятого RC pipeline.
- Уже нормализованные RC records, catalogs и exceptions переносятся без
  пересчёта. Исторические архивные empty model aliases остаются без изменений.
- Manual locks, aliases, supplier/category mappings, supplier-specific size
  rules, исходные supplier records и существующие категории сохраняются.
  Утрата/замена защищённого значения останавливает migration.
- Size options хранятся отдельно от реальных variants; SKU и stock не создаются.
- Inventory semantics, freshness-as-warning и permissions остаются RC-логикой.
  Tactical Belt не получает подтверждённой QUANTITY policy и остаётся UNKNOWN.
- Publication/archive flags, названия, описания и исходные цены не меняются.
  Все вычисленные цены сравнены до/после. Новое массовое repricing не запускалось.
- Повторная migration того же version marker — no-op: 0 writes, 0 новых backups.

| Результат | Предоставленный Drive snapshot | Нормализованная RC-копия |
|---|---:|---:|
| Canonical categories до → после | 0 → 143 | 143 → 143 |
| Товары | 3 113 | 3 113 |
| SKU / variants / bindings | 8 734 | 8 734 |
| Category SAFE_AUTO / LIKELY / AMBIGUOUS | 2714 / 194 / 205 | 2711 / 194 / 204 |
| Архивные алиасы без классификации | 0 | 4 |
| Size SAFE_AUTO / LIKELY / AMBIGUOUS | 7709 / 1 / 1024 | 7866 / 1 / 867 |
| PAYMENT_READY | 4 563 | 4 915 |
| Сохранённые товары с manual locks | 8 | 8 |

У старого снимка нет рабочего canonical category catalogue; это не потеря
134 категорий. Их сохранность проверена дополнительным RC прогоном, содержащим
все исходные 134 IDs и 9 утверждённых новых. Разница size/category/readiness
в таблице относится к разным сохранённым данным, не к изменению правил RC.

Supplier availability в обоих прогонах:
`IN_STOCK=6187`, `OUT_OF_STOCK=1034`, `PREORDER=1`, `UNKNOWN=1512`.
Числовой stock отсутствует у 8734 bindings; это не равно UNKNOWN availability.
UNKNOWN — неподтверждённый Tactical Belt. STATUS/Prom policies продолжают
работать без придуманного количества. Единственный Prom preorder не получает
разрешения немедленной оплаты.

В **обоих** прогонах:

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
IDS_UNCHANGED = true
MANUAL_LOCKS_UNCHANGED = true
PRICES_UNCHANGED = true
STOCK_UNCHANGED = true
PUBLICATION_UNCHANGED = true
SYNC_ENABLED = false
AUTOPRICES_ENABLED = false
PRODUCTION_WRITES = 0
```

Подробности и hashes: [migration-control.json](migration-control.json),
[RC preservation](rc-preservation/migration-control.json).

## BACKUP_PATH / FORMAT

В контрольной среде полный pre-migration backup находится вне Git:
`/workspace/private/pim-data/production-10.9.3-full-pre-migration.json.gz`.
SHA256 и companion IndexedDB path указаны в migration-control.json.
Приватные supplier данные и настройки **не включены** в release package/commit.

При будущей установке:

- Files/data backup: `/home/xk589064/.pim-deploy-backups/pim-10.9.3-<timestamp>-<id>/`.
  Каталог 0700; `data-backup.bin` 0600; `previous/`, `installation.json`,
  rollback-capable `install-production.py`.
- Browser snapshot: `rubizh_pim_release_backups_v1/backups/<backup_id>` плюс
  скачанный `rubizh-pim-10.9.3-<id>.json.gz`.
- Формат: `rubizh-pim-production-snapshot`, version 1. Все raw KV records,
  неизвестные ключи, logs, docs/binary files, old backups и localStorage;
  binary SHA256 + complete source rows SHA256 + archive SHA256.
- Наличие документа без binary content блокирует полную migration.
- Companion backup database отдельна от каталога: snapshot не копирует сам себя.

## ROLLBACK_PLAN

1. Сохранить полную rescue-копию текущих данных перед rollback. Отказ/ошибка
   её сохранения отменяет rollback.
2. Вернуть pre-migration snapshot через PIM backup UI либо отдельную
   `/release-recovery.html` на том же домене. Recovery также автоматически
   возвращает rescue rows при провале persisted verification.
3. Вернуть прежние runtime files командой `install-production.py rollback
   --backup <BACKUP_PATH>`. Проверить SHA256 предыдущих файлов; добавленные
   runtime files удалить только если они отсутствовали до установки.
4. Current server CAS versions сохраняются. Rollback страницы сам не пишет
   удалённую PIM; после возврата старой версии синхронизацию и возможные conflicts
   проверить отдельно. Магазин и supplier feeds не вызываются.

Полные команды и порядок «данные → файлы»:
[PRODUCTION-INSTALL.md](../../app/PRODUCTION-INSTALL.md).
Terminal installer требует Python 3; наличие Python на хостинге ещё не проверялось.
CLI не может самостоятельно читать или восстанавливать IndexedDB браузера;
поэтому file rollback и browser data rollback явно разделены.

## Проверки и package

743 теста прошли, failures/skipped = 0:

- 605 application tests: 575 существующих + 26 production migration + 4 recovery.
- 49 size/business dry-run tests.
- 78 принятых category tests.
- 11 terminal installer tests: install/rollback, corrupt hashes, unsafe paths,
  private backup location, missing binary, wrong namespace, injected partial failure.

Контрольные migration прогоны сохраняли реальный полный snapshot, применяли
migration в изолированной DB, перезагружали данные, повторяли migration и
восстанавливали pre-migration state с rescue backup. Никакие реальные XLS/feeds
не загружались в production. REAL_SOURCE_COMPATIBILITY остаётся отдельным
незакрытым условием для включения автопрайсов, включая Tactical Belt semantics.

Packaged index/recovery и 9 внешних dependencies отдают HTTP 200 в локальной
проверке. Это проверка пакета, не проверка hosting deployment/auth/backend.
Архив 848 474 байта, 15 runtime files:
`rubizh-pim-10.9.3-production.zip`.
SHA256 `fe0a19f719b5dec39bd52deca77c0ccff2634c347b120f6bd343dbb54af51722`.
Повторная сборка дала идентичный SHA256. Credentials/backups/data отсутствуют
в allowlist пакета. Deployment, migration live state и store `/pim/sync`
не запускались. Следующее разрешённое решение — проверка владельцем этого release;
установка требует его отдельного подтверждения и актуальной полной копии.
