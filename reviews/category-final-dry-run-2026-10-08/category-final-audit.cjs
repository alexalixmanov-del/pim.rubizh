'use strict';
// Read-only simulation. Never assigns the virtual taxonomy into cfg or calls migration/publication.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const R = require('./category-reasons.cjs');
const args = Object.fromEntries(process.argv.slice(2).map(s => {
  const i = s.indexOf('=');
  assert(i > 0, 'Expected key=PATH');
  return [s.slice(0, i), s.slice(i + 1)];
}));
for (const k of ['baseline', 'cases', 'prior', 'previous', 'out']) assert(args[k], `Required: ${k}=PATH`);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const baseline = read(args.baseline);
const cases = read(args.cases);
const prior = read(args.prior);
const previous = read(args.previous);
const tax = baseline.cfg.canonical_categories;
const original = {products: sha(baseline.products), cfg: sha(baseline.cfg), taxonomy: sha(tax)};
const files = Object.fromEntries(['baseline', 'cases', 'prior', 'previous'].map(k => [k, sha(fs.readFileSync(args[k], 'utf8'))]));
const byId = new Map(baseline.products.map(p => [p.id, p]));
const byKey = new Map(cases.map(c => [c.key, c]));
const previousByKey = new Map(previous.map(c => [c.key, c]));
const approved = [R.symbolsRoot, ...R.gaps, R.watchRule].map(g => ({id: g.id, name: g.name, parent_id: g.parent, aliases: [...g.aliases]}));
assert.equal(approved.length, 9);
assert(!approved.some(c => c.id === 'footwear_loafers'));
for (const c of approved) {
  assert(!tax.some(t => t.id === c.id));
  assert(!c.parent_id || [...tax, ...approved].some(t => t.id === c.parent_id));
}
// Separate data structure used only as an argument to the pure classifier. Baseline stays untouched.
const virtualTaxonomy = [...structuredClone(tax), ...structuredClone(approved)];
for (const t of tax) assert.deepEqual(virtualTaxonomy.find(c => c.id === t.id), t);
const target = prior.filter(t => t.kind === 'category' && t.tier === 'AMBIGUOUS');
assert.equal(target.length, 124);
const groupOf = s => s.supplier_category_path_raw || s.supplier_category_raw || '';
const neighbors = baseline.products.filter(p => p.canonical_category_id === 'weapon_slings' && p.category_status === 'CONFIRMED').flatMap(p => p.variants.flatMap(v => Object.entries(v.offers || {})).filter(([, o]) => /ремін|ремень/u.test(R.norm(o.source_name || o.source_name_raw || p.original_name)) && /носіння зброї|носіння.*стрілецької зброї|ношения оружия/u.test(R.norm(o.source_description))).map(([sid, o]) => ({id: p.id, supplier_id: sid, supplier_group: groupOf(o), category: 'weapon_slings', independent_source_evidence: true, source_excerpt: R.plain(o.source_description).slice(0, 400)})));
const results = target.map(t => {
  const c = byKey.get(t.key);
  assert(c && c.products.length === 1);
  const item = c.products[0], orig = byId.get(item.id), prev = previousByKey.get(t.key);
  assert(orig && prev);
  const dto = {...item, category_rule_id: orig.category_rule_id, category_locked: orig.category_locked, manual_locks: orig.manual_locks, fieldMeta: orig.fieldMeta};
  const mappingDecisions = (baseline.cfg.supplier_category_mapping || []).filter(m => m.confirmed !== false && Number(m.confidence ?? 1) >= 0.8 && item.sources.some(s => s.supplier_id === m.supplier_id && (String(m.supplier_category_raw) === String(s.supplier_category_raw) && (!m.supplier_category_path_raw || R.norm(m.supplier_category_path_raw) === R.norm(groupOf(s))) || R.norm(m.supplier_category_path_raw || m.supplier_category_normalized || m.supplier_category_raw) === R.norm(groupOf(s))))).map(m => ({...m, category_rule_id: 'mapping-protected-review'}));
  const decision = R.resolve(dto, virtualTaxonomy, {neighbors, mappingDecisions});
  return {...decision, key: t.key, previous_tier: prev.tier, previous_category: prev.category || null, previous_partition: prev.partition, suppliers: [...new Set(item.sources.map(s => s.supplier_name))], sources: item.sources.map(s => ({supplier_id: s.supplier_id, supplier_name: s.supplier_name, supplier_category: groupOf(s)})), simulated: true, applied: false};
});
assert.equal(new Set(results.map(r => r.key)).size, 124);
assert(!results.some(r => r.category === 'footwear_loafers'));
const approvedIds = new Set(approved.map(c => c.id));
// Outside approved profile categories, no earlier unresolved case can be forced closed by this run.
for (const r of results.filter(r => !approvedIds.has(r.category))) {
  const old = previousByKey.get(r.key);
  assert.equal(r.tier, old.tier, `Unexpected tier change outside approved scope: ${r.name}`);
  assert.equal(r.category || null, old.category || null);
}
const targetIds = new Set(results.map(r => r.id));
const allCatalogCoverage = [...R.gaps, R.watchRule].map(g => ({id: g.id, title_candidates: baseline.products.filter(p => g.title.test(R.norm(p.name))).map(p => p.id)}));
for (const g of allCatalogCoverage) assert(g.title_candidates.every(id => targetIds.has(id)), `Additional ${g.id} candidates outside reviewed scope need review`);
const reviewedCounts = Object.fromEntries(['SAFE_AUTO', 'LIKELY', 'AMBIGUOUS'].map(t => [t, results.filter(r => r.tier === t).length]));
const priorCounts = Object.fromEntries(['SAFE_AUTO', 'LIKELY'].map(t => [t, prior.filter(r => r.kind === 'category' && r.tier === t).length]));
const finalCounts = {CATEGORY_SAFE_AUTO: priorCounts.SAFE_AUTO + reviewedCounts.SAFE_AUTO, CATEGORY_LIKELY: priorCounts.LIKELY + reviewedCounts.LIKELY, CATEGORY_AMBIGUOUS: reviewedCounts.AMBIGUOUS};
assert.equal(Object.values(finalCounts).reduce((a, b) => a + b, 0), 316);
const actualDiff = {categories_before: tax.length, categories_after: tax.length, new_category_ids: [], removed_category_ids: [], renamed_category_ids: [], moved_category_ids: [], alias_changes: [], supplier_mapping_changes: [], applied: false};
const categoryPlans = approved.map(c => {
  const matches = results.filter(r => r.category === c.id);
  const groups = new Map();
  for (const r of matches) for (const s of r.sources) {
    const key = `${s.supplier_id}|${s.supplier_category}`;
    const g = groups.get(key) || {...s, product_ids: []};
    g.product_ids.push(r.id);
    groups.set(key, g);
  }
  return {...c, counts: Object.fromEntries(['SAFE_AUTO', 'LIKELY', 'AMBIGUOUS'].map(t => [t, matches.filter(r => r.tier === t).length])), products_count: matches.length, examples: matches.slice(0, 3).map(r => ({id: r.id, name: r.name})), supplier_rules: [...groups.values()].map(s => ({...s, target_category_id: c.id, scope: 'CONDITIONAL_WHOLE_ITEM_RULE', requires_matching_supplier_title: true, requires_description_evidence: true, preserve_manual_locks: true, never_replace_existing_mapping: true, proposal_only: true, applied: false}))};
});
const simulatedDiff = {categories_before: tax.length, categories_after: virtualTaxonomy.length, new_category_ids: approved.map(c => c.id), removed_category_ids: [], renamed_category_ids: [], moved_category_ids: [], alias_changes: approved.filter(c => c.aliases.length).map(c => ({category_id: c.id, add: c.aliases, remove: []})), supplier_mapping_changes: categoryPlans.flatMap(c => c.supplier_rules), scope: 'VIRTUAL_ONLY', applied: false};
const residual = results.filter(r => r.tier !== 'SAFE_AUTO');
const grouped = new Map();
for (const r of residual) {
  const key = `${r.rule_id}|${r.suppliers.join('|')}`;
  const g = grouped.get(key) || {group_id: key, tier: r.tier, category: r.category, suppliers: r.suppliers, reason: r.reason, products: []};
  g.products.push({id: r.id, name: r.name, warnings: r.warnings || []});
  grouped.set(key, g);
}
assert.equal(sha(baseline.products), original.products);
assert.equal(sha(baseline.cfg), original.cfg);
assert.equal(sha(tax), original.taxonomy);
for (const [k, h] of Object.entries(files)) assert.equal(sha(fs.readFileSync(args[k], 'utf8')), h);
const variants = baseline.products.flatMap(p => p.variants);
const summary = {
  status: 'FINAL_DRY_RUN_ONLY',
  reviewed_original_ambiguous: 124,
  reviewed_original_124_counts: reviewedCounts,
  final_category_queue_counts: finalCounts,
  earlier_134_SAFE_AUTO_and_58_LIKELY_carried_forward: true,
  scope_note: 'All approved category title candidates across the 3113-product snapshot are inside the reviewed 124. Earlier unaffected 134 SAFE_AUTO and 58 LIKELY are carried forward, not reclassified.',
  previous_counts_of_124: {SAFE_AUTO: 70, LIKELY: 33, AMBIGUOUS: 21},
  new_safe_auto_vs_previous_review: results.filter(r => r.tier === 'SAFE_AUTO' && r.previous_tier !== 'SAFE_AUTO').length,
  approved_new_category_ids: approved.map(c => c.id),
  watch_confirmed_SAFE_AUTO: results.filter(r => r.category === 'field_watches' && r.tier === 'SAFE_AUTO').length,
  original_taxonomy_gaps: 18,
  remaining_gaps_in_virtual_taxonomy: results.filter(r => r.partition === 'TAXONOMY_GAP').length,
  exceptions_in_original_124: residual.length,
  grouped_exceptions: grouped.size,
  categories_before: tax.length,
  categories_after_simulated: virtualTaxonomy.length,
  categories_after_actual: tax.length,
  aliases_added_simulated: approved.reduce((n, c) => n + c.aliases.length, 0),
  supplier_rules_simulated: simulatedDiff.supplier_mapping_changes.length,
  actual_diff: actualDiff,
  simulated_diff: simulatedDiff,
  integrity: {LOST_CATEGORIES: 0, LOST_SKU: 0, LOST_VARIANTS: 0, products_before: baseline.products.length, products_after: baseline.products.length, variants_before: variants.length, variants_after: variants.length, sku_entries_before: variants.filter(v => v.sku).length, sku_entries_after: variants.filter(v => v.sku).length, working_taxonomy_unchanged: true, canonical_ids_unchanged: true, manual_locks_unchanged: true, existing_aliases_unchanged: true, supplier_mappings_unchanged: true, entire_products_unchanged: true, entire_cfg_unchanged: true, original_hashes: original, input_file_hashes: files},
  production_changed: false,
  migration_executed: false,
  publication_executed: false,
  categories_applied: false,
  products_moved: false,
  mappings_or_aliases_written_to_working_data: false,
  verification_limit: 'Read-only simulation; unchanged data hashes do not validate a future applied migration.'
};
fs.mkdirSync(args.out, {recursive: true});
for (const [name, data] of Object.entries({'summary.json': summary, 'results-124.json': results, 'approved-category-plan.json': categoryPlans, 'taxonomy-diff.json': {actual: actualDiff, simulated: simulatedDiff}, 'grouped-exceptions.json': [...grouped.values()], 'taxonomy-virtual.json': {schema_version: 1, categories: virtualTaxonomy, virtual_only: true}, 'coverage.json': allCatalogCoverage})) {
  fs.writeFileSync(path.join(args.out, name), JSON.stringify(data, null, 2) + '\n');
}
console.log(JSON.stringify({reviewedCounts, finalCounts, categories: {actual: tax.length, virtual: virtualTaxonomy.length}, watch: summary.watch_confirmed_SAFE_AUTO, newSafe: summary.new_safe_auto_vs_previous_review, exceptions: residual.length, groups: grouped.size, aliases: summary.aliases_added_simulated, supplierRules: summary.supplier_rules_simulated, integrity: summary.integrity}, null, 2));
