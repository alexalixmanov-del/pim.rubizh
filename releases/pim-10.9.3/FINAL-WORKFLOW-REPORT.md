# PIM 10.9.3 final workflow: report (09.10.2026)

Status: **prepared and tested. Not deployed (PRODUCTION_WRITES = 0).** It installs only after
a separate OWNER PRODUCTION GO, using the commands in SITE `docs/PIM-V3-RELEASE-REPORT-20261009.md`.

Archive: `rubizh-pim-10.9.3-final-workflow.zip`, SHA256
`3351991f6ae6918bc4f8041e3221504bb0821ddaf382676fc99e4c4a1690adfd`. The build is reproducible:
two builds produce identical bytes.

## Changes

- **G02.** The exporter composes pricing v1 for every real SKU: `site_price`, `wholesale`,
  `pricing_policy_version`, `discount_margin_floor_pct`, `minimum_sale_price` and `kit_price`.
  Classification no longer drops `barcode` or the private fulfillment fields.
- **Exact wire contract 3.** `pimSiteWire()` produces `products[]` with all the versions,
  `catalog_revision`, `category_catalog_hash`, 143 categories and explicit `hide_ids`.
  The fixture is byte-for-byte exporter output and a test checks it.
- **MODEL → COLOR → real SKU.** There are no Cartesian SKUs: a size without a SKU is a
  request-only size option.
- **Decision.** Each product gets READY, MODERATION or REJECTED, with codes and evidence.
  Inventory never blocks READY.
- **5 screens:** НА САЙТ, МОДЕРАЦИЯ, НЕ ПРОХОДИТ, ИМПОРТ, BACKUP. There is no developer menu.
- **Publisher.**
  - Sends in packages of 100 models with batch_id `PB-<rev>-<hash>`.
  - Requires an exact ACK `COMMITTED`.
  - Refuses to send without a SITE capability that matches contract 3.
  - Hides only explicitly.
  - Auto-sync is off.
- **Import.** A new supplier item without photos does not create a product: it is recorded
  as «не проходит: нет фото».
- **Products without photos.** Cleanup goes preview → signature → backup → archive.
  Nothing is deleted.
- **Inventory policies.**
  - M-WIN, Киборг and Армолайн use STATUS.
  - UKR-TEC uses Prom `+`, `-`, `!` and day counts.
  - Tactical Belt stays UNKNOWN.

## Tests

- 634/634 unit tests.
- 12/12 installer tests.
- 49/49 dry-run tests.
- UI in Chromium at 390, 768 and 1440 px, light and dark: no JS errors, no overflow.

## Blockers

- **The current PIM backup (Drive, 87 MB) could not be downloaded into the isolated
  environment.** There is therefore no SOURCE_BACKUP_SHA256, no control migration of the
  real data, no real READY/MODERATION/REJECTED counts and no startup timings. The previous
  review counted 3113 products, 8734 SKU, 143 categories and 8 manual locks.
- **No original supplier price lists.** Autoprices stay off.
