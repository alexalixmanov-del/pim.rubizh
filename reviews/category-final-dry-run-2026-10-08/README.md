# Финальный dry-run категорий, 2026-10-08

Решение владельца о девяти новых категориях учтено только в виртуальной taxonomy. Нет записи в приложение, cfg, products, dictionaries, нет migration/publication. Отдельная review-папка сохраняет предыдущие результаты без изменения.

[REPORT.md](REPORT.md) — результаты, evidence, исключения, aliases, supplier rules и diff. `taxonomy-virtual.json` — артефакт расчёта, не рабочий справочник и не файл импорта. `footwear_loafers` заменён только в предложениях; действующий canonical ID не переименовывался.

Тесты правил и изоляции:

```bash
node --test reviews/category-final-dry-run-2026-10-08/category-reasons.test.cjs
```

Полный запуск в подготовленной среде; приватная исходная база намеренно не публикуется:

```bash
node reviews/category-final-dry-run-2026-10-08/category-final-audit.cjs \
  baseline=/workspace/private/pim-data/dry-run-baseline-10.9.2.json \
  cases=/workspace/private/pim-data/dry-run-cases-10.9.2.json \
  prior=audit/final-dry-run/queue.json \
  previous=reviews/category-gaps-dry-run-2026-10-08/results-124.json \
  out=audit/category-final-dry-run
```

Runner проверяет SHA-256 всех products, cfg и входных файлов; предыдущие вопросы вне одобренных категорий нельзя принудительно закрыть. Он не вызывает функции изменения PIM. Результаты содержат названия/идентификаторы и факты поставщиков, без прайсов, остатков, учётных данных и полного каталога.
