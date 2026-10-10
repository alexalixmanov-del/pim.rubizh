"""Read-only supplier semantics audit; conditional scenarios do not confirm policies."""
from pathlib import Path
import collections, hashlib, html, json, re, sys
baseline=Path(sys.argv[1] if len(sys.argv)>1 else '/workspace/private/pim-data/dry-run-baseline-10.9.2.json')
facts_path=Path(sys.argv[2] if len(sys.argv)>2 else '/tmp/pim-inventory-payment-facts.json')
out=Path(sys.argv[3]) if len(sys.argv)>3 else Path(__file__).parent
raw=baseline.read_bytes(); data=json.loads(raw); f=json.loads(facts_path.read_text()); facts={x['sku']:x for x in f['facts']};names={s['id']:s['name'] for s in data['cfg']['suppliers']};sha=lambda b:hashlib.sha256(b).hexdigest()
rows=[(p,v,sid,o) for p in data['products'] for v in p['variants'] for sid,o in v.get('offers',{}).items()]
assert len(rows)==8734 and len({v['sku'] for p,v,sid,o in rows})==8734
accepted={'м вин','киборг','армолайн'}
def evaluate(prom=False,quantity=False):
 availability=collections.Counter();exclusive=collections.Counter();independent=collections.Counter();per_supplier={};overlap=0
 for p,v,sid,o in rows:
  name=names[sid];value=str(o.get('rawAvailability') or '').strip();status='UNKNOWN'
  if name in accepted:status={'есть':'IN_STOCK','нет':'OUT_OF_STOCK'}.get(value.lower(),'UNKNOWN')
  if prom and name=='укр тек':status={'+':'IN_STOCK','-':'OUT_OF_STOCK','!':'IN_STOCK'}.get(value,'PREORDER' if value.isdigit() and int(value)>0 else 'UNKNOWN')
  if quantity and name=='тактикал белт' and re.fullmatch(r'\d+',value):status='IN_STOCK' if int(value)>0 else 'OUT_OF_STOCK'
  availability[status]+=1;per_supplier.setdefault(name,collections.Counter())[status]+=1
  z=facts[v['sku']];binding=z['source_binding_status']!='CONFIRMED';size=z['size_status']=='SIZE_CONFIRMATION_REQUIRED' or z['size_confidence_tier']!='SAFE_AUTO';price=isinstance(z['price'],(int,float)) and z['price']>0 and not z['margin_blocked']
  independent['BINDING_CONFIRMATION_REQUIRED']+=binding;independent['SIZE_CONFIRMATION_REQUIRED']+=size;overlap+=binding and size
  state='BINDING_CONFIRMATION_REQUIRED' if binding else 'SIZE_CONFIRMATION_REQUIRED' if size else 'PAYMENT_READY' if status=='IN_STOCK' and price else 'PRICE_CONFIRMATION_REQUIRED' if status=='IN_STOCK' else 'ORDER_CONFIRMATION_REQUIRED' if status=='PREORDER' else 'NOT_PAYMENT_READY_AVAILABILITY'
  exclusive[state]+=1
 return {'availability':{k:availability[k] for k in ['IN_STOCK','OUT_OF_STOCK','PREORDER','UNKNOWN']},'per_supplier':{k:dict(v) for k,v in per_supplier.items()},'readiness_exclusive':dict(exclusive),'readiness_independent':dict(independent),'binding_size_overlap':overlap,'readiness_precedence':'BINDING → SIZE → PAYMENT/PRICE → PREORDER_CONFIRMATION → AVAILABILITY_UNRESOLVED_OR_OUT'}
def example(row):
 p,v,sid,o=row;text=html.unescape(re.sub('<[^>]+>',' ',str(p.get('source_description') or p.get('desc') or '')));text=re.sub(r'\s+',' ',text).strip()
 snippets=[text[max(0,m.start()-45):m.end()+90] for m in re.finditer(r'наявн|налич|замов|заказ|залиш|остат|днів|дней',text,re.I)][:3]
 return {'product_id':p['id'],'sku':v['sku'],'supplier_sku':o.get('s'),'name':p['name'],'brand':p.get('brand'),'size':v.get('size'),'color':v.get('color'),'source_column':next(s for s in data['cfg']['suppliers'] if s['id']==sid)['mapping'].get('stock'),'raw_value':o.get('rawAvailability'),'stock_quantity':o.get('stock'),'attributes':p.get('attrs') or {},'description_excerpt':text[:360],'availability_keyword_context':snippets,'record_origin':'SAVED_BINDING_AND_MODEL_CONTEXT_NOT_ORIGINAL_WORKBOOK_ROW'}
reports={}
for name in ['тактикал белт','укр тек']:
 rr=[r for r in rows if names[r[2]]==name];hist=collections.Counter(str(r[3].get('rawAvailability') or '').strip() for r in rr);groups={}
 if name=='тактикал белт':
  buckets={'ZERO':[r for r in rr if str(r[3].get('rawAvailability') or '').strip()=='0'],'POSITIVE_INTEGER':[r for r in rr if re.fullmatch(r'\d+',str(r[3].get('rawAvailability') or '').strip()) and int(r[3]['rawAvailability'])>0],'EMPTY':[r for r in rr if not str(r[3].get('rawAvailability') or '').strip()],'NONSTANDARD':[r for r in rr if str(r[3].get('rawAvailability') or '').strip() and not re.fullmatch(r'\d+',str(r[3].get('rawAvailability')).strip())]}
  for key,items in buckets.items():
   selected=[];seen=set()
   if key=='POSITIVE_INTEGER':
    for value in ['1265','1','3','48','985','769','30','2','5','66']:
     r=next((r for r in items if str(r[3].get('rawAvailability'))==value),None)
     if r and r[1]['sku'] not in seen:selected.append(r);seen.add(r[1]['sku'])
   for r in items:
    if len(selected)>=10:break
    if r[1]['sku'] not in seen:selected.append(r);seen.add(r[1]['sku'])
   groups[key]={'count':len(items),'examples':[example(r) for r in selected]}
 else:
  for value in ['+','-','!','3']:
   items=[r for r in rr if str(r[3].get('rawAvailability'))==value];selected=[];seen=set()
   for r in items:
    if len(selected)>=10:break
    if r[3].get('s') not in seen:selected.append(r);seen.add(r[3].get('s'))
   groups[value]={'count':len(items),'examples':[example(r) for r in selected]}
 reports[name]={'source_column':next(s for s in data['cfg']['suppliers'] if s['name']==name)['mapping'].get('stock'),'bindings':len(rr),'unique_raw_values':sorted(hist,key=lambda x:int(x)) if name=='тактикал белт' else list(hist),'count_per_value':dict(hist),'groups':groups,'original_source_rows_available':False,'supplier_semantics_confirmed':name=='укр тек','confirmation_evidence':'User confirmed standard Prom.ua export; official Prom field specification' if name=='укр тек' else 'User explicitly reports quantity semantics not confirmed'}
assert sha(baseline.read_bytes())==sha(raw)
result={'status':'READ_ONLY_DRY_RUN_UKR_TEC_CONFIRMED_TACTICAL_QUANTITY_PENDING','source_sha256':sha(raw),'classified_candidate_sha256':f['candidate_sha256'],'runtime_html_sha256':f.get('runtime_html_sha256'),'source_semantics':reports,'before_ukr_confirmation':evaluate(),'accepted_policy_only':evaluate(prom=True),'conditional_tactical_quantity_confirmed':evaluate(prom=True,quantity=True),'conditional_scenarios_are_not_policy_approval':True,'confirmed_supplier_policies':{'M-WIN':'STATUS','Киборг':'STATUS','Армолайн':'STATUS','UKR-TEC':'STATUS_PROM_EXPORT'},'unconfirmed_supplier_policies':{'Tactical Belt':'QUANTITY_CANDIDATE'},'ukr_tec_inventory_policy':{'inventory_mode':'STATUS','source_profile':'PROM_XLS_XLSX_CSV_UK','source_column':'Наявність','confirmed':True,'confirmation_source':'USER_CONFIRMED_FORMAT + OFFICIAL_FORMAT_SPECIFICATION','status_mapping':{'+':'IN_STOCK','-':'OUT_OF_STOCK','!':'IN_STOCK'},'positive_integer_rule':'PREORDER','positive_integer_semantics':'SUPPLIER_DELIVERY_LEAD_TIME_DAYS_NOT_QUANTITY','raw_3_delivery_days':3,'stock_quantity':None,'manufacturing_days':None,'age_changes_availability':False,'unrecognized_token':'UNKNOWN_OR_RETAIN_LAST_VALID_OBSERVATION','working_policy_applied':False},'quantity_records_created':0,'working_policy_writes':0,'catalog_writes':0,'production_writes':0,'source_input_unchanged':True,'import_apply_calls':0,'persist_calls':0,'readiness_scope':'Virtual readiness of existing real SKU using policy signal, confirmed binding, confirmed applicable size, positive calculated price and margin guards. Does not publish, charge or authorize a live checkout; publication separately controlled.'}
out.mkdir(parents=True,exist_ok=True);(out/'dry-run.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['status','accepted_policy_only','before_ukr_confirmation','conditional_tactical_quantity_confirmed','production_writes']},ensure_ascii=False))
