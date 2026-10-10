# Category gaps review, 2026-10-08

Отдельный offline review-кандидат для исходных 124 CATEGORY_AMBIGUOUS базы 10.9.2. В production build и startup не подключён. Справочники и товары не меняет.

- [REPORT.md](REPORT.md): причины, результаты, предложения, фактический/proposed diff.
- `category-reasons.cjs`: правила самого изделия с доказательствами; ручные/подтверждённые mappings защищены.
- `category-audit.cjs`: воспроизводимый read-only runner с fingerprint-проверками.
- `results-124.json`: все 124 решения с доказательствами; содержит названия, ID и supplier product facts, без прайсов/остатков/API-ключей/учётных данных.
- `taxonomy-before.json`: неизменённая действующая taxonomy, 134 записи, для автономного воспроизведения тестов.

Проверка правил, без подключения production и приватной базы:

```bash
node --test reviews/category-gaps-dry-run-2026-10-08/category-reasons.test.cjs
```

Dry-run в подготовленной рабочей среде (полная база и входные cases намеренно не публикуются в Git):

```bash
node reviews/category-gaps-dry-run-2026-10-08/category-audit.cjs \
  baseline=/workspace/private/pim-data/dry-run-baseline-10.9.2.json \
  cases=/workspace/private/pim-data/dry-run-cases-10.9.2.json \
  prior=audit/final-dry-run/queue.json \
  out=audit/category-gaps-dry-run
```

В этом запуске прежние 134 SAFE_AUTO и 58 LIKELY не переоценивались. Все численные выводы о текущем остатке основаны на исходных 124; охват новой классификации всей базы не заявляется. SAFE_AUTO не применяется к копии или production, поскольку сейчас запрошен план без массовых переносов до подтверждения. New IDs, aliases и supplier rules — только предложения.
