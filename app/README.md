# РУБІЖ PIM 10.9.3 RC

Сборка только для локальной проверки категорий, размеров и supplier inventory policies. Не устанавливать на live/production.

143 canonical categories, принятые evidence rules, SAFE_AUTO и сгруппированные исключения, отдельные модельные size_catalogs и реальные SKU. Сеть и `/pim/sync` заблокированы; импорты не публикуют, не скрывают и не архивируют товары. IndexedDB и серверные настройки используют отдельный namespace.

Откройте каталог через `python3 -m http.server 8765`, затем `http://localhost:8765/rubizh_pim.html`. Каталог товаров не включён: восстановите свою резервную копию через интерфейс на этой тестовой копии. Production-данные браузера не читаются и не меняются. Не размещайте приватный backup в каталоге HTTP-сервера.

Разработка: `npm ci --cache /tmp/rubizh-npm-cache`, `npm run build`, `npm test`, `npm run test:dry-run`. Контрольный импорт: из корня репозитория `node --max-old-space-size=6144 audit/category-size-control-import.cjs /absolute/path/private-backup.json /absolute/path/report-dir`. Тесты используют isolated browser runtime и IndexedDB; оригинальные XLS/XLSX отсутствуют, поэтому полный контроль использует явно обозначенный replay сохранённых supplier bindings. Новые колонки и строки проверяются отдельными integration fixtures.

`contracts/category-size-export.schema.json` задаёт нормализованный формат. `buildFeed()` даёт только локальный review export: UNKNOWN не разрешает оплату. PREORDER, ORDER_ON_REQUEST и SIZE_CONFIRMATION_REQUIRED допускают заявку, но требуют подтверждения менеджера перед оплатой. Финальные counts и результаты двух импортов находятся в `reviews/pim-10.9.3-rc/` в репозитории.

Старые документы и deployment-скрипты в исходном пакете исторические; эта сборка не является production-релизом и не содержит installer.

Supplier `stock_freshness_hours` задаёт только порог предупреждения о давности (default warning 36 часов), не срок действия stock. Последний валидный остаток действует до новой валидной записи или ручной правки; возраст не меняет availability и не запрещает оплату. `imported_at` не является временем наблюдения stock. REAL_SOURCE_COMPATIBILITY выполняется отдельным read-only checker по реальным прайсам; отсутствие оригиналов оставляет production автопрайсы заблокированными.

Inventory policies: M-WIN/Киборг/Армолайн STATUS `есть/нет`; UKR-TEC подтверждённый Prom STATUS `+/-/!/days`; Tactical Belt остаётся одним неподтверждённым правилом QUANTITY. Подтверждённый STATUS не требует численного количества для оплаты. Supplier availability, SKU size/binding и price gates экспортируются отдельно. Raw `3` у UKR-TEC — supplier delivery term, не stock и не срок производства. В новой копии сначала выполните контрольный импорт для инициализации policies; до него export закрыт.
