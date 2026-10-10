'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('./category-reasons.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
for(const k of ['baseline','cases','prior','out'])assert(args[k],`Required: ${k}=PATH`);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')), sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const baseline=read(args.baseline),cases=read(args.cases),prior=read(args.prior),tax=baseline.cfg.canonical_categories;
const before={products:sha(baseline.products),cfg:sha(baseline.cfg),taxonomy:sha(tax),file:sha(fs.readFileSync(args.baseline,'utf8'))};
const byId=new Map(baseline.products.map(p=>[p.id,p])),byKey=new Map(cases.map(c=>[c.key,c]));
const target=prior.filter(x=>x.kind==='category'&&x.tier==='AMBIGUOUS');assert.equal(target.length,124);
const groupOf=s=>s.supplier_category_path_raw||s.supplier_category_raw||'';
// Neighbours can corroborate only when their own source directly proves a complete weapon sling.
const neighbors=baseline.products.filter(p=>p.canonical_category_id==='weapon_slings'&&p.category_status==='CONFIRMED').flatMap(p=>{
 const offers=p.variants.flatMap(v=>Object.entries(v.offers||{}));
 return offers.filter(([,o])=>/ремін|ремень/u.test(R.norm(o.source_name||o.source_name_raw||p.original_name))&&/носіння зброї|носіння.*стрілецької зброї|ношения оружия/u.test(R.norm(o.source_description))).map(([sid,o])=>({id:p.id,supplier_id:sid,supplier_group:groupOf(o),category:'weapon_slings',independent_source_evidence:true,source_excerpt:R.plain(o.source_description).slice(0,400)}));
});
const results=target.map(t=>{
 const c=byKey.get(t.key);assert(c&&c.products.length===1);const item=c.products[0],orig=byId.get(item.id);assert(orig);
 const dto={...item,category_rule_id:orig.category_rule_id,category_locked:orig.category_locked,manual_locks:orig.manual_locks,fieldMeta:orig.fieldMeta};
 const mappingDecisions=(baseline.cfg.supplier_category_mapping||[]).filter(m=>m.confirmed!==false&&Number(m.confidence??1)>=0.8&&item.sources.some(s=>s.supplier_id===m.supplier_id&&(String(m.supplier_category_raw)===String(s.supplier_category_raw)&&(!m.supplier_category_path_raw||R.norm(m.supplier_category_path_raw)===R.norm(groupOf(s)))||R.norm(m.supplier_category_path_raw||m.supplier_category_normalized||m.supplier_category_raw)===R.norm(groupOf(s))))).map(m=>({...m,category_rule_id:'mapping-protected-review'}));
 const r=R.resolve(dto,tax,{neighbors,mappingDecisions});return {...r,key:t.key,suppliers:[...new Set(item.sources.map(s=>s.supplier_name))],sources:item.sources.map(s=>({supplier_id:s.supplier_id,supplier_name:s.supplier_name,supplier_category:groupOf(s)})),applied:false};
});
assert.equal(new Set(results.map(x=>x.key)).size,124);
for(const r of results)assert(['EXISTING_CATEGORY_AMBIGUOUS','TAXONOMY_GAP'].includes(r.partition));
const tiers=Object.fromEntries(['SAFE_AUTO','LIKELY','AMBIGUOUS'].map(t=>[t,results.filter(x=>x.tier===t).length]));
const counts={CATEGORY_SAFE_AUTO:prior.filter(x=>x.kind==='category'&&x.tier==='SAFE_AUTO').length+tiers.SAFE_AUTO,CATEGORY_LIKELY:prior.filter(x=>x.kind==='category'&&x.tier==='LIKELY').length+tiers.LIKELY,CATEGORY_AMBIGUOUS:tiers.AMBIGUOUS,EXISTING_CATEGORY_AMBIGUOUS:results.filter(x=>x.partition==='EXISTING_CATEGORY_AMBIGUOUS').length,TAXONOMY_GAP:results.filter(x=>x.partition==='TAXONOMY_GAP').length};
assert.equal(counts.CATEGORY_SAFE_AUTO+counts.CATEGORY_LIKELY+counts.CATEGORY_AMBIGUOUS,316);
const proposals=R.gaps.filter(g=>results.some(r=>r.proposed_category_id===g.id)).map(g=>{
 const affected=results.filter(r=>r.proposed_category_id===g.id),mappingGroups=new Map();
 for(const r of affected)for(const s of r.sources){const k=s.supplier_id+'|'+s.supplier_category;const v=mappingGroups.get(k)||{...s,examples:[]};v.examples.push(r.name);mappingGroups.set(k,v);}
 return {proposed_category_id:g.id,name:g.name,parent_category:g.parent,parent_name:tax.find(c=>c.id===g.parent)?.name||R.symbolsRoot.name,products_count:affected.length,suppliers:[...new Set(affected.flatMap(r=>r.suppliers))],examples:affected.slice(0,3).map(r=>({product_id:r.id,name:r.name})),reason_existing_categories_do_not_fit:g.why,considered_category_ids:g.alternatives,proposed_aliases:g.aliases,supplier_categories:[...mappingGroups.values()].map(s=>({...s,examples:s.examples.slice(0,3),action:'PROPOSAL_ONLY',scope:'CONDITIONAL_WHOLE_ITEM_RULE',predicate:'taxonomy-gap:'+g.id,requires_description_evidence:true,never_replace_existing_mapping:true})),warnings:[...new Set(affected.flatMap(r=>r.warnings||[]))],approval_required:true};
});
if(proposals.some(p=>p.parent_category==='symbols'))proposals.unshift({proposed_category_id:'symbols',name:R.symbolsRoot.name,parent_category:null,parent_name:null,products_count:0,descendant_products_count:results.filter(r=>r.proposed_category_id==='symbols_flags').length,suppliers:proposals.find(p=>p.proposed_category_id==='symbols_flags').suppliers,examples:proposals.find(p=>p.proposed_category_id==='symbols_flags').examples,reason_existing_categories_do_not_fit:R.symbolsRoot.why,considered_category_ids:['camouflage','field_gear'],proposed_aliases:[],supplier_categories:[],approval_required:true});
counts.PROPOSED_NEW_CATEGORIES=proposals.length;
for(const p of proposals){assert(!tax.some(c=>c.id===p.proposed_category_id));assert(!p.parent_category||tax.some(c=>c.id===p.parent_category)||proposals.some(c=>c.proposed_category_id===p.parent_category));for(const id of p.considered_category_ids)assert(tax.some(c=>c.id===id),`Unknown alternative ${id}`);}
const actualDiff={categories_before:tax.length,categories_after:tax.length,new_category_ids:[],removed_category_ids:[],renamed_category_ids:[],moved_category_ids:[],alias_changes:[],supplier_mapping_changes:[]};
const proposedDiff={categories_before:tax.length,categories_after:tax.length+proposals.length,new_category_ids:proposals.map(p=>p.proposed_category_id),removed_category_ids:[],renamed_category_ids:[],moved_category_ids:[],alias_changes:proposals.filter(p=>p.proposed_aliases.length).map(p=>({category_id:p.proposed_category_id,add:p.proposed_aliases,remove:[]})),supplier_mapping_changes:proposals.flatMap(p=>p.supplier_categories.map(s=>({category_id:p.proposed_category_id,...s}))),applied:false,approval_required:true};
const residualGroups=new Map();
for(const r of results.filter(x=>x.partition==='EXISTING_CATEGORY_AMBIGUOUS'&&x.tier!=='SAFE_AUTO')){
 const k=r.rule_id+'|'+r.suppliers.join('|');const g=residualGroups.get(k)||{group_id:k,tier:r.tier,rule_id:r.rule_id,category:r.category,suppliers:r.suppliers,count:0,examples:[],supplier_groups:new Set(),reason:r.reason,product_ids:[]};
 g.count++;g.product_ids.push(r.id);if(g.examples.length<3)g.examples.push(r.name);for(const s of r.sources)g.supplier_groups.add(s.supplier_category);residualGroups.set(k,g);
}
const groups=[...residualGroups.values()].map(g=>({...g,supplier_groups:[...g.supplier_groups]}));
// Planning must be entirely read-only, including metadata, mapping dictionaries, histories and offers.
assert.equal(sha(baseline.products),before.products);assert.equal(sha(baseline.cfg),before.cfg);assert.equal(sha(tax),before.taxonomy);assert.equal(sha(fs.readFileSync(args.baseline,'utf8')),before.file);
const variants=baseline.products.flatMap(p=>p.variants),sku=variants.map(v=>v.sku).filter(Boolean);
const summary={scope:'124 original CATEGORY_AMBIGUOUS; no data edits or category moves',status:'DRY_RUN_PROPOSALS_ONLY',baseline_category_questions:316,reviewed_original_ambiguous:124,original_124:tiers,partition_of_original_124:{EXISTING_CATEGORY_AMBIGUOUS:counts.EXISTING_CATEGORY_AMBIGUOUS,TAXONOMY_GAP:counts.TAXONOMY_GAP},existing_partition_tiers:Object.fromEntries(['SAFE_AUTO','LIKELY','AMBIGUOUS'].map(t=>[t,results.filter(x=>x.partition==='EXISTING_CATEGORY_AMBIGUOUS'&&x.tier===t).length])),final_category_queue_counts:counts,unresolved_existing_groups:groups.length,gap_leaf_proposals:proposals.filter(p=>p.parent_category).length,new_root_proposals:proposals.filter(p=>!p.parent_category).length,integrity:{LOST_CATEGORIES:0,LOST_SKU:0,LOST_VARIANTS:0,products_before:baseline.products.length,products_after:baseline.products.length,variants_before:variants.length,variants_after:variants.length,sku_entries_before:sku.length,sku_entries_after:sku.length,canonical_ids_unchanged:true,manual_locks_unchanged:true,supplier_mappings_unchanged:true,aliases_unchanged:true,entire_products_and_config_unchanged:true,hashes:before},taxonomy_diff:actualDiff,proposed_taxonomy_diff_if_approved:proposedDiff,production_changed:false,previous_134_SAFE_AUTO_and_58_LIKELY_reaudited:false,verification_limit:'No categories or product moves have been applied. Integrity proves a read-only planning run, not a completed future migration.'};
fs.mkdirSync(args.out,{recursive:true});for(const [n,x]of Object.entries({'summary.json':summary,'results-124.json':results,'taxonomy-proposals.json':proposals,'taxonomy-diff.json':{actual:actualDiff,proposed_if_approved:proposedDiff},'grouped-existing-exceptions.json':groups}))fs.writeFileSync(path.join(args.out,n),JSON.stringify(x,null,2));
console.log(JSON.stringify({original_124:tiers,final:counts,groups:groups.length,integrity:summary.integrity},null,2));
