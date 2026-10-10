#!/usr/bin/env python3
"""Aggregate owner report of a clean import (audit/import-audit.cjs lines + original supplier files).

Usage: python3 -I audit/import-audit-report.py DETAIL.jsonl SOURCES.json OUT.json PRIVATE_DIR
  OUT.json      aggregates and a few safe examples (titles, supplier article codes) — may go to Git
  PRIVATE_DIR   full per-row tables (M-WIN groups, Tactical Belt signals) — never committed
"""
import collections, csv, html, json, os, re, sys
import xml.etree.ElementTree as ET

detail_path, sources_path, out_path, private_dir = sys.argv[1:5]
C = collections.Counter
NAMES = {'sf0t3l7jegf9': 'M-WIN', 's4p9slmnn0ki': 'Tactical Belt', 's2akya7xoafn': 'UKR-TEC', 's2bggyi42dhh': 'Киборг', 's2hjvaqgnp29': 'Армолайн'}
MWIN, TB = 'sf0t3l7jegf9', 's4p9slmnn0ki'
SELECTOR = 'ОБЕРІТЬ РОЗМІР СІТКИ:'

P, Q, G, paths = [], [], [], []
for line in open(detail_path, encoding='utf-8'):
    x = json.loads(line)
    {'product': P, 'queue': Q, 'group': G}.get(x['t'], []).append(x)
    if x['t'] == 'paths':
        paths = x['rows']
byid = {p['id']: p for p in P}
active = [p for p in P if not p['archived']]


def sup(p):
    s = sorted({o['sid'] for v in p['variants'] for o in v['offers']})
    return NAMES.get(s[0], s[0]) if s else '-'


def plain(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip().lower()


def yml_offers(path):
    out = {}
    for o in ET.parse(path).getroot().find('shop').find('offers'):
        d = {'id': o.get('id'), 'group_id': o.get('group_id'), 'available': o.get('available'), 'in_stock': o.get('in_stock'),
             'name': o.findtext('name') or '', 'desc': o.findtext('description') or '', 'price': o.findtext('price'),
             'quantity_in_stock': o.findtext('quantity_in_stock'), 'params': {p.get('name'): p.text for p in o.findall('param')}}
        for k in {d['id'], o.findtext('vendorCode'), o.findtext('article'), d['params'].get('Артикул')}:
            if k:
                out.setdefault(k, d)
    return out


sources = {s['supplier_id']: s['file'] for s in json.load(open(sources_path))}
src = {sid: yml_offers(f) for sid, f in sources.items() if f.endswith('.xml')}

# ---------- decisions and moderation breakdown ----------
report = {'totals': {'products': len(P), 'skus': sum(len(p['variants']) for p in P), 'decisions': dict(C(p['state'] for p in P))}}
mod = collections.defaultdict(lambda: {'models': 0, 'skus': 0})
mod_sup = collections.defaultdict(lambda: collections.defaultdict(lambda: {'models': 0, 'skus': 0}))
for p in P:
    if p['state'] != 'MODERATION':
        continue
    for r in {r['code'] for r in p['reasons']}:
        mod[r]['models'] += 1; mod[r]['skus'] += len(p['variants'])
        mod_sup[sup(p)][r]['models'] += 1; mod_sup[sup(p)][r]['skus'] += len(p['variants'])
report['moderation_reasons'] = {k: dict(v) for k, v in sorted(mod.items())}
report['moderation_by_supplier'] = {s: {k: dict(v) for k, v in sorted(x.items())} for s, x in sorted(mod_sup.items())}
report['states_by_supplier'] = {s: dict(C(p['state'] for p in P if sup(p) == s)) for s in sorted({sup(p) for p in P})}

# evidence presence per moderated model
ev = collections.defaultdict(C)
for p in P:
    if p['state'] != 'MODERATION':
        continue
    s = sup(p); offers = [o for v in p['variants'] for o in v['offers']]
    ev[s]['models'] += 1
    ev[s]['group_id_present'] += bool(any(o['source_model'] for o in offers))
    ev[s]['color_known'] += all(not v['palette']['unknown'] for v in p['variants'])
    ev[s]['size_exact_or_not_required'] += all(v['size_status'] in ('EXACT_SIZE', 'ONE_SIZE', 'NO_SIZE_REQUIRED') for v in p['variants'])
    ev[s]['category_confirmed'] += bool(p['canonical_category_id'])
    ev[s]['photos'] += p['photos'] > 0
report['moderation_evidence_by_supplier'] = {k: dict(v) for k, v in sorted(ev.items())}

# ---------- grouping classes ----------
COL_TOKENS = {'tactical', 'pouch', 'jacket', 'pants', 'black', 'olive', 'multicam', 'shirt', 'pack', 'double', 'mag', 'winter', 'softshell'}


def descs(p):
    out = set()
    for v in p['variants']:
        for o in v['offers']:
            d = src.get(o['sid'], {}).get(o['s'])
            if d:
                out.add(plain(d['desc']))
    return out


def grouping_class(g):
    ps = [byid[i] for i in g['ids']]
    R = set(g['reasons'])
    codes = [tuple(p['identity']['codes']) for p in ps]
    sup_id = (ps[0]['identity']['suppliers'] or [''])[0]
    cells = [{c['key'] + '|' + v['size'] for v in p['variants'] for c in p['colors'] if v['sku'] in c['skus']} for p in ps]
    disjoint = all(not (cells[i] & cells[j]) for i in range(len(ps)) for j in range(i + 1, len(ps)))
    D = [descs(p) for p in ps]
    same_desc = bool(D[0]) and all(len(d) == 1 for d in D) and len(set().union(*D)) == 1 and len(next(iter(D[0]))) >= 200
    latin = len({t.lower() for t in re.findall(r'[a-z][a-z0-9-]{2,}', g['name'], re.I)} - COL_TOKENS)
    if sup_id == MWIN and 'сітк' in g['name'].lower():
        return 'F_size_grid', sup_id
    if all(codes) and len(set(codes)) == 1:
        return 'A_same_group_id', sup_id
    if not any(codes):
        return 'C_no_supplier_group', sup_id
    if 'Один цвет и размер принадлежат разным исходным карточкам' in R or not disjoint:
        return 'F_size_or_cell_conflict', sup_id
    if 'Различаются характеристики, совместимость или связи' in R:
        return 'G_source_inconsistency', sup_id
    if 'Поставщик передал разные коды модели' in R:
        return 'C_codes_not_slices', sup_id
    if same_desc and latin < 3:
        return 'C_identical_text_no_model_token', sup_id
    return 'C_insufficient_evidence', sup_id


gc = collections.defaultdict(lambda: {'groups': 0, 'models': 0, 'skus': 0})
gcs = collections.defaultdict(C)
examples = collections.defaultdict(list)
for g in G:
    if g['automatic']:
        continue
    cls, s = grouping_class(g)
    gc[cls]['groups'] += 1; gc[cls]['models'] += len(g['ids']); gc[cls]['skus'] += g['variants']
    gcs[NAMES.get(s, s)][cls] += len(g['ids'])
    if len(examples[cls]) < 4:
        examples[cls].append({'name': g['name'], 'cards': len(g['ids']), 'reasons': g['reasons']})
report['grouping_review'] = {'classes': {k: dict(v) for k, v in sorted(gc.items())}, 'by_supplier': {k: dict(v) for k, v in sorted(gcs.items())}, 'examples': examples}
report['grouping_flagged_models'] = sum(1 for p in P if p['state'] == 'MODERATION' and any(r['code'] == 'grouping' for r in p['reasons']))
report['merged_into_models'] = sum(1 for p in P if p['merged_into'])

# ---------- M-WIN ----------
mw_src = {d['id']: d for d in src.get(MWIN, {}).values()}
sku2 = {}
for p in P:
    for v in p['variants']:
        for o in v['offers']:
            if o['sid'] == MWIN:
                sku2[o['s']] = (p, v, o)
groups = collections.defaultdict(list)
for d in mw_src.values():
    groups[d['group_id']].append(d)
mw_products = [p for p in active if any(o['sid'] == MWIN for v in p['variants'] for o in v['offers'])]
os.makedirs(private_dir, exist_ok=True)
with open(os.path.join(private_dir, 'mwin-groups.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['group_id', 'rows', 'supplier_sku', 'raw_title', 'normalized_title', 'raw_model', 'normalized_model', 'raw_color', 'normalized_color', 'raw_size', 'normalized_size', 'selector', 'pim_model_id', 'pim_color', 'pim_size', 'size_status', 'state'])
    for gid, ds in sorted(groups.items(), key=lambda x: (-len(x[1]), x[0])):
        for d in ds:
            art = d['params'].get('Артикул') or d['id']
            p, v, o = sku2.get(art, (None, None, None))
            w.writerow([gid, len(ds), art, d['name'], p and p['title'], gid, p and ','.join(p['identity']['codes']), d['params'].get('Колір') or d['params'].get('Цвет'), v and v['color'],
                        d['params'].get('Розмір') or '', v and v['size'], d['params'].get(SELECTOR) or '', p and p['id'], v and v['palette'], v and v['size'], v and v['size_status'], p and p['state']])
multi = {g: ds for g, ds in groups.items() if len(ds) > 1}
mw = {'source_rows': len(mw_src), 'groups': len(groups), 'multi_row_groups': len(multi), 'rows_in_multi_row_groups': sum(len(x) for x in multi.values()),
      'products': len(mw_products), 'skus': sum(len(p['variants']) for p in mw_products), 'multi_variant_models': sum(len(p['variants']) > 1 for p in mw_products)}
outcome = C()
rep = []
for gid, ds in sorted(multi.items(), key=lambda x: (-len(x[1]), x[0])):
    arts = [d['params'].get('Артикул') or d['id'] for d in ds]
    models = {sku2[a][0]['id'] for a in arts if a in sku2}
    net = 'сітк' in ds[0]['name'].lower()
    outcome[('nets' if net else 'other') + ':' + ('one_model' if len(models) == 1 else 'model_per_row' if len(models) == len(ds) else 'partly_merged')] += 1
    if not net or len(rep) < 6:
        rows = []
        for a, d in zip(arts, ds):
            p, v, o = sku2.get(a, (None, None, None))
            rows.append({'supplier_sku': a, 'raw_title': d['name'], 'raw_color': d['params'].get('Колір') or d['params'].get('Цвет'), 'raw_size': d['params'].get('Розмір'), 'selector': d['params'].get(SELECTOR),
                         'pim_model': p and p['id'], 'pim_color': v and (v['palette']['color'] or v['palette']['camouflage']), 'pim_size': v and v['size'], 'size_status': v and v['size_status'], 'state': p and p['state']})
        rep.append({'group_id': gid, 'rows': len(ds), 'models': len(models), 'items': rows})
mw['multi_row_group_outcome'] = dict(outcome)
mw['representative_groups'] = rep[:24]
gorka = [d for d in mw_src.values() if 'горка' in d['name'].lower()]
mw['gorka'] = [{'group_id': d['group_id'], 'rows_in_group': len(groups[d['group_id']]), 'title': d['name']} for d in gorka]
report['m_win'] = mw

# M-WIN size-grid owner decision (selector)
sel = [d for d in mw_src.values() if SELECTOR in d['params']]
dims = lambda s: (lambda m: (m.group(1).replace(',', '.'), m.group(2).replace(',', '.')) if m else None)(re.search(r'(\d+(?:[.,]\d+)?)\s*[хx×]\s*(\d+(?:[.,]\d+)?)', s or ''))
agree = C(); values = C(); affected_states = C(); sizes_now = C()
for d in sel:
    v = d['params'][SELECTOR]; values[v] += 1
    p, var, o = sku2.get(d['params'].get('Артикул') or d['id'], (None, None, None))
    if p:
        affected_states[p['state']] += 1; sizes_now[var['size_status']] += 1
    if v == 'Індивідуальний розмір':
        agree['individual_size_price_per_sqm'] += 1; continue
    s = dims(v); n = dims(d['name']); wl = None
    if d['params'].get('Ширина') and d['params'].get('Довжина'):
        wl = tuple(re.sub(r'[^\d.,]', '', d['params'][k]).replace(',', '.') for k in ('Ширина', 'Довжина'))
    agree['title_agrees' if s == n else 'title_differs'] += 1
    agree['width_length_agree' if wl == s else 'width_length_missing' if wl is None else 'width_length_differ'] += 1
report['m_win_size_grid'] = {'selector_field': SELECTOR, 'rows': len(sel), 'groups': len({d['group_id'] for d in sel}), 'non_net_rows': sum('сітк' not in d['name'].lower() for d in sel),
                             'distinct_values': len(values), 'values': dict(values.most_common()), 'consistency': dict(agree), 'current_state': dict(affected_states), 'current_size_status': dict(sizes_now),
                             'duplicate_value_inside_group': sum(1 for g in {d['group_id'] for d in sel} if len([d for d in sel if d['group_id'] == g]) != len({d['params'][SELECTOR] for d in sel if d['group_id'] == g}))}

# ---------- Tactical Belt inventory signals ----------
tb = list({d['id']: d for d in src.get(TB, {}).values()}.values())
sig = {'@available': C(d['available'] for d in tb), '@in_stock': C(str(d['in_stock']) for d in tb), 'quantity_in_stock': C('0' if d['quantity_in_stock'] == '0' else '>0' if (d['quantity_in_stock'] or '').isdigit() else repr(d['quantity_in_stock']) for d in tb)}
cross = C((d['available'], str(d['in_stock']), '0' if d['quantity_in_stock'] == '0' else '>0') for d in tb)
qs = sorted(int(d['quantity_in_stock']) for d in tb if (d['quantity_in_stock'] or '').isdigit() and d['quantity_in_stock'] != '0')
tb_p = [p for p in active if any(o['sid'] == TB for v in p['variants'] for o in v['offers'])]
report['tactical_belt_inventory'] = {'offers': len(tb), 'signals': {k: dict(v) for k, v in sig.items()}, 'cross': {'|'.join(k): n for k, n in cross.items()},
                                     'quantity_positive': {'count': len(qs), 'min': qs[0] if qs else None, 'median': qs[len(qs) // 2] if qs else None, 'max': qs[-1] if qs else None},
                                     'examples': [{'sku': d['id'], 'available': d['available'], 'quantity_in_stock': d['quantity_in_stock']} for d in tb[:2] + [x for x in tb if x['available'] == 'true'][:3]],
                                     'pim_skus': sum(len(p['variants']) for p in tb_p), 'pim_availability': dict(C(v['availability'] for p in tb_p for v in p['variants']))}

# ---------- sizes, colours, photos, price, queue ----------
sc = collections.defaultdict(C); raw = collections.defaultdict(C); prov = collections.defaultdict(C)
for p in active:
    for v in p['variants']:
        s = sup(p); sc[s][v['size_status']] += 1
        if v['size_status'] == 'SIZE_CONFIRMATION_REQUIRED':
            o = v['offers'][0]; raw[s][(o['structured_size'] or o['size_raw'] or '(нет)')[:30]] += 1; prov[s][o['size_input_provenance'] or 'NONE'] += 1
report['size_status'] = {'total': dict(C(v['size_status'] for p in active for v in p['variants'])), 'by_supplier': {k: dict(v) for k, v in sorted(sc.items())},
                         'confirmation_raw_examples': {k: dict(v.most_common(8)) for k, v in sorted(raw.items())}, 'confirmation_provenance': {k: dict(v) for k, v in sorted(prov.items())}}
report['availability'] = dict(C(v['availability'] for p in active for v in p['variants']))
unknown_colors = C()
for p in P:
    if p['state'] == 'MODERATION' and any(r['code'] == 'color' for r in p['reasons']):
        for v in p['variants']:
            for u in v['palette']['unknown']:
                unknown_colors[(sup(p), u)] += 1
report['color_unknown_values'] = [{'supplier': s, 'value': u, 'skus': n} for (s, u), n in unknown_colors.most_common()]
report['photo_ownership'] = [{'model': p['id'], 'title': p['title'], 'colors_without_photos': [r['evidence'] for r in p['reasons'] if r['code'] == 'photo_ownership'],
                              'offers': [{'sku': v['sku'], 'supplier_sku': o['s'], 'raw_color': o['color_raw'], 'pim_color': v['color'], 'photos': o['photos']} for v in p['variants'] for o in v['offers']]}
                             for p in P if any(r['code'] == 'photo_ownership' for r in p['reasons'])]
report['ready_price_blockers'] = [{'model': p['id'], 'title': p['title'], 'sku': v['sku'], 'supplier': sup(p), 'supplier_sku': v['offers'][0]['s'], 'supplier_price': v['offers'][0]['priceInput'], 'availability': v['availability']}
                                  for p in P if p['state'] == 'READY' for v in p['variants'] if not v['price'] > 0]
report['import_queue'] = [{'supplier': NAMES.get(q['sup'], q['sup']), 'supplier_sku': q['s'], 'title': q['n'], 'photos': q['photos'], 'description_chars': q['desc'], 'price_present': bool(q['cost']),
                           'reason': (q['review'] or {}).get('type') or (q['rejected_import'] or {}).get('reason') or q['status'] or 'OPEN',
                           'strong_duplicate_of': [c['pid'] for c in (q['review'] or {}).get('candidates', []) if c.get('strong')]} for q in Q]
report['variant_cell'] = {'models': sum(1 for p in P if any(r['code'] == 'variant_cell' for r in p['reasons'])), 'examples': [{'title': p['title'], 'skus': [r['evidence'] for r in p['reasons'] if r['code'] == 'variant_cell'][0]} for p in P if any(r['code'] == 'variant_cell' for r in p['reasons'])][:8]}
report['price_unit'] = {'models': sum(1 for p in P if any(r['code'] == 'price_unit' for r in p['reasons'])), 'by_supplier': dict(C(sup(p) for p in P if any(r['code'] == 'price_unit' for r in p['reasons'])))}

# category paths
cat = []
for r in paths:
    unresolved = sum(r['suggested'].values())
    if unresolved:
        cat.append({'supplier': NAMES.get(r['sid'], r['sid']), 'path': r['path'], 'unresolved_products': unresolved, 'confirmed': r['confirmed'], 'path_alias_candidates': r['path_candidates']})
report['category_unresolved_paths'] = sorted(cat, key=lambda x: -x['unresolved_products'])[:40]
report['category_exception_rules'] = [
    {'supplier': s, 'rule': r, 'models': n} for (s, r), n in C((sup(p), e['rule']) for p in P if p['state'] == 'MODERATION' and any(x['code'] == 'category' for x in p['reasons']) for e in p['exceptions'] if e['kind'] == 'category').most_common(30)]

json.dump(report, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
print(json.dumps({'decisions': report['totals']['decisions'], 'moderation': {k: v['models'] for k, v in report['moderation_reasons'].items()}, 'm_win': {k: mw[k] for k in ('source_rows', 'products', 'skus', 'multi_variant_models')}}, ensure_ascii=False))
