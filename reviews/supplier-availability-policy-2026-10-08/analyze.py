"""Read-only analysis of saved supplier signals. No policy or catalog writes."""
from pathlib import Path
import collections, hashlib, json, sys, zipfile
source=Path(sys.argv[1] if len(sys.argv)>1 else '/workspace/private/pim-data/dry-run-baseline-10.9.2.json')
out=Path(sys.argv[2]) if len(sys.argv)>2 else Path(__file__).parent
original=Path('/workspace/attachments/29028286-ebfa-43bd-bc7d-913c2c7c179b/rubizh-pim-backup-2026-10-05-19-21.json.zip')
sha=lambda b: hashlib.sha256(b).hexdigest()
raw=source.read_bytes(); data=json.loads(raw)
canon=lambda x: json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':'))
def signals(d):
 return sorted([[sid,p['id'],v['sku'],o.get('s'),o.get('rawAvailability'),o.get('stock'),o.get('availability')] for p in d['products'] for v in p['variants'] for sid,o in v.get('offers',{}).items()])
archive_check=None
if original.exists():
 with zipfile.ZipFile(original) as z:
  entry=next(n for n in z.namelist() if n.endswith('.json') and not n.startswith('__MACOSX/'))
  attachment=json.loads(z.read(entry))
 archive_check={'archive_sha256':sha(original.read_bytes()),'entry':entry,'availability_signals_identical':collections.Counter(tuple([z[0]]+z[3:]) for z in signals(attachment))==collections.Counter(tuple([z[0]]+z[3:]) for z in signals(data)), 'comparison_key':'supplier_id + supplier_sku + rawAvailability + stock + derived_availability; preserves multiplicity, excludes changed model grouping IDs'}
 assert archive_check['availability_signals_identical']
results=[];total=collections.Counter()
for s in data['cfg']['suppliers']:
 rows=[(p,v,o) for p in data['products'] for v in p['variants'] for sid,o in v.get('offers',{}).items() if sid==s['id']]
 hist=collections.Counter(str(o.get('rawAvailability') or '').strip() for p,v,o in rows)
 raw_groups=collections.defaultdict(list)
 for p,v,o in rows: raw_groups[o.get('s')].append(o)
 textual=set(hist).issubset({'есть','нет'}) and bool(hist)
 symbolic=s['name']=='укр тек'
 mode='STATUS' if textual or symbolic else 'QUANTITY'
 mapping={'есть':'IN_STOCK','нет':'OUT_OF_STOCK'} if textual else {}
 counts=collections.Counter()
 for val,n in hist.items():counts[mapping.get(val,'UNKNOWN')]+=n
 total.update(counts)
 ambiguous=[{'product_id':p['id'],'sku':v['sku'],'supplier_sku':o.get('s'),'name':p['name'],'raw_value':o.get('rawAvailability'),'legacy_derived_availability':o.get('availability'),'legacy_derived_lead_days':o.get('leadDays'),'size':v.get('size'),'color':v.get('color')} for p,v,o in rows if symbolic and str(o.get('rawAvailability')) in ['!','3']]
 numeric=[]
 if not textual and not symbolic:
  for val,n in hist.items():
   try:numeric.append((int(val),n))
   except ValueError:pass
 terms=s.get('terms') or {}
 result={'supplier_id':s['id'],'supplier':s['name'],'bindings':len(rows),'unique_supplier_skus':len(raw_groups),'products':len({p['id'] for p,v,o in rows}),'numeric_stock_present':sum(type(o.get('stock')) in (int,float) for p,v,o in rows),'source_field':s.get('mapping',{}).get('stock'),'raw_status_histogram':dict(sorted(hist.items())),'legacy_derived_status_histogram':dict(collections.Counter(o.get('availability') for p,v,o in rows)),'source_rows_retained':sum(bool(o.get('source_row_raw')) for p,v,o in rows),'proposed_inventory_mode':mode,'policy_confidence':'SAFE_AUTO' if textual else 'AMBIGUOUS_NOT_CONFIRMED' if symbolic else 'LIKELY_NOT_CONFIRMED','can_assign_from_saved_evidence':textual,'proposed_status_mapping':mapping,'unmapped_values':dict((k,n) for k,n in hist.items() if k not in mapping),'candidate_source_status_counts':dict(counts),'preorder_rule_confirmed':False,'feed_presence_rule_confirmed':False,'shared_supplier_sku_groups':sum(len(g)>1 for g in raw_groups.values()),'conflicting_raw_status_groups':sum(len({o.get('rawAvailability') for o in g})>1 for g in raw_groups.values()),'manual_preorder_flags':sum(o.get('preorderManual') is True for p,v,o in rows),'confirmed_supplier_preorder_policy':terms.get('preorderConfirmed') is True,'ambiguous_examples':ambiguous,'examples':[], 'proposed_inventory_policy':{'supplier_id':s['id'],'inventory_mode':mode,'source_column':s.get('mapping',{}).get('stock'),'confirmed_by_saved_semantics':textual,'activation':'DRY_RUN_ONLY' if textual else 'BLOCKED_SOURCE_SEMANTICS','status_mapping':mapping,'quantity_positive_rule':'IN_STOCK' if mode=='QUANTITY' else None,'quantity_zero_rule':'OUT_OF_STOCK' if mode=='QUANTITY' else None,'preorder_mapping':{},'unknown_rule':'UNKNOWN unless an earlier confirmed observation or manual override applies','feed_presence_confirmed':False,'age_changes_availability':False,'numeric_stock_required':mode=='QUANTITY'}}
 examples=[]
 desired=['есть','нет'] if textual else ['+','-','!','!','3'] if symbolic else ['0','1','3','48','1265']
 seen=set()
 for val in desired:
  match=next(((p,v,o) for p,v,o in rows if str(o.get('rawAvailability'))==val and v['sku'] not in seen),None)
  if match:
   p,v,o=match;seen.add(v['sku']);examples.append({'product_id':p['id'],'sku':v['sku'],'supplier_sku':o.get('s'),'name':p['name'],'size':v.get('size'),'color':v.get('color'),'source_column':result['source_field'],'raw_value':o.get('rawAvailability'),'stock_quantity':o.get('stock'),'example_origin':'SAVED_BINDING_NOT_ORIGINAL_WORKBOOK_ROW'})
 for p,v,o in rows:
  if len(examples)>=5:break
  if v['sku'] not in seen:
   seen.add(v['sku']);examples.append({'product_id':p['id'],'sku':v['sku'],'supplier_sku':o.get('s'),'name':p['name'],'size':v.get('size'),'color':v.get('color'),'source_column':result['source_field'],'raw_value':o.get('rawAvailability'),'stock_quantity':o.get('stock'),'example_origin':'SAVED_BINDING_NOT_ORIGINAL_WORKBOOK_ROW'})
 result['examples']=examples
 if numeric:result['numeric_raw_summary']={'zero':sum(n for val,n in numeric if val==0),'positive':sum(n for val,n in numeric if val>0),'min':min(val for val,n in numeric),'max':max(val for val,n in numeric),'distinct_values':len(numeric),'interpretation':'Looks quantitative; quantity semantics cannot be confirmed from header/raw numbers alone.'}
 results.append(result)
assert sum(r['bindings'] for r in results)==8734
assert sha(source.read_bytes())==sha(raw),'Input was modified'
report={'status':'READ_ONLY_POLICY_PROPOSAL_NOT_APPLIED','source_sha256':sha(raw),'original_attachment_crosscheck':archive_check,'source_type':'SAVED_SUPPLIER_BINDINGS_NOT_ORIGINAL_WORKBOOKS','bindings':8734,'proposed_source_status_counts':dict(total),'counts_scope':'Supplier observations only; not final SKU/payment statuses. Size/SKU binding, manual locks and selected supplier still require their own gates.','policies_applied':0,'quantities_created':0,'cfg_writes':0,'catalog_writes':0,'production_writes':0,'supplier_signal_sha256_before':sha(canon(signals(data)).encode()),'supplier_signal_sha256_after':sha(canon(signals(json.loads(source.read_bytes()))).encode()),'results':results}
out.mkdir(parents=True,exist_ok=True);(out/'analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report['status'],'suppliers':len(results),'bindings':8734,'candidate_source_status_counts':dict(total),'policies_applied':0,'quantities_created':0,'production_writes':0},ensure_ascii=False))
