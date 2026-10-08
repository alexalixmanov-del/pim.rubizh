(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RubizhInventory=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const version=1,defaults={
 sf0t3l7jegf9:{id:'m-win-status-v1',mode:'STATUS',confirmed:true,source_column:'Наличие',status_map:{'есть':'IN_STOCK','нет':'OUT_OF_STOCK'},confirmation:'USER_ACCEPTED_SAVED_STATUS_EVIDENCE'},
 s2bggyi42dhh:{id:'kiborg-status-v1',mode:'STATUS',confirmed:true,source_column:'Наличие',status_map:{'есть':'IN_STOCK','нет':'OUT_OF_STOCK'},confirmation:'USER_ACCEPTED_SAVED_STATUS_EVIDENCE'},
 s2hjvaqgnp29:{id:'armoline-status-v1',mode:'STATUS',confirmed:true,source_column:'Наличие',status_map:{'есть':'IN_STOCK','нет':'OUT_OF_STOCK'},confirmation:'USER_ACCEPTED_SAVED_STATUS_EVIDENCE'},
 s2akya7xoafn:{id:'ukr-tec-prom-status-v1',mode:'STATUS',confirmed:true,source_column:'Наявність',source_profile:'PROM_XLS_UK',status_map:{'+':'IN_STOCK','-':'OUT_OF_STOCK','!':'IN_STOCK'},positive_integer_semantics:'DELIVERY_DAYS_PREORDER',confirmation:'USER_CONFIRMED_PROM_EXPORT_AND_OFFICIAL_SPEC'},
 s4p9slmnn0ki:{id:'tactical-belt-quantity-candidate-v1',mode:'QUANTITY',confirmed:false,source_column:'Наличие',confirmation:'QUANTITY_SEMANTICS_NOT_CONFIRMED'}
};
const validQuantity=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
function policy(supplier){return supplier?.inventory_policy||defaults[supplier?.id]||{id:'unconfirmed-'+(supplier?.id||'supplier'),mode:'NO_AVAILABILITY_SIGNAL',confirmed:false};}
function resolve(p,o={}){
 const base={policy_id:p?.id||null,policy_version:version,policy_signature:JSON.stringify(p||{}),inventory_mode:p?.mode||'NO_AVAILABILITY_SIGNAL',availability_status:'UNKNOWN',availability_source:null,availability_confirmation:'UNKNOWN',stock_quantity:null,quantity_confirmation:'UNKNOWN',delivery_lead_time_days:null,ready_to_dispatch:false,raw_value:String(o.rawAvailability??'').trim(),rule:null};
 const result=(status,source,quantity=null,extra={})=>({...base,availability_status:status,availability_source:source,availability_confirmation:'CONFIRMED',stock_quantity:quantity,quantity_confirmation:quantity==null?'UNKNOWN':'CONFIRMED',...extra});
 if(o.availability_manual===true&&['IN_STOCK','OUT_OF_STOCK','PREORDER','ORDER_ON_REQUEST','UNKNOWN'].includes(o.manual_availability_status))return result(o.manual_availability_status,'MANUAL',null,{rule:'manual-availability'});
 if(o.stock_manual===true)return validQuantity(o.stock)?result(o.stock>0?'IN_STOCK':'OUT_OF_STOCK','MANUAL',o.stock,{rule:'manual-quantity'}):base;
 if(!p?.confirmed||o.missing||o.discontinued)return base;
 if(o.inventory_source_column!=null&&p.source_column&&![p.source_column,...(p.source_column_aliases||[])].includes(o.inventory_source_column))return base;
 if(o.order_on_request===true)return result('ORDER_ON_REQUEST','STATUS',null,{rule:'explicit-order-request'});
 if(o.preorder===true&&['order','PREORDER'].includes(o.availability)&&(o.preorder_confirmed===true||o.preorderManual===true||/(?:preorder|предзаказ|під замов|под заказ)/iu.test(o.rawAvailability||'')))return result('PREORDER',o.preorderManual?'MANUAL':'STATUS',null,{rule:'explicit-preorder'});
 if(p.mode==='QUANTITY'){
  if(!validQuantity(o.stock)||o.invalid_stock)return base;
  return result(o.stock>0?'IN_STOCK':'OUT_OF_STOCK','QUANTITY',o.stock,{rule:'confirmed-quantity'});
 }
 if(p.mode==='STATUS'){
  const value=base.raw_value.toLocaleLowerCase(),status=p.status_map?.[value];
  if(['IN_STOCK','OUT_OF_STOCK','PREORDER','ORDER_ON_REQUEST'].includes(status))return result(status,'STATUS',null,{rule:'exact-status-map',ready_to_dispatch:p.source_profile==='PROM_XLS_UK'&&value==='!'});
  if(p.source_profile==='PROM_XLS_UK'&&p.positive_integer_semantics==='DELIVERY_DAYS_PREORDER'&&/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value)))return result('PREORDER','STATUS',null,{rule:'prom-delivery-days',delivery_lead_time_days:Number(value)});
 }
 if(p.mode==='FEED_PRESENCE'&&p.feed_presence_confirmed===true&&o.feed_presence_confirmed===true)return result('IN_STOCK','FEED_PRESENCE',null,{rule:'confirmed-feed-presence'});
 return base;
}
function observe(p,o){
 const raw=resolve(p,o),old=o.last_valid_inventory_observation;
 if(o.availability_manual===true||o.stock_manual===true)return raw;
 // Only reuse an observation belonging to this exact binding and policy.
 if(old&&old.supplier_sku===o.s&&p.confirmed&&old.policy_id===p.id&&old.policy_signature===JSON.stringify(p)&&old.availability_confirmation==='CONFIRMED')return {...old};
 return raw;
}
function retain(p,old,incoming,{manual=false}={}){
 const next=resolve(p,incoming),prior=old?observe(p,old):null,same=old?.s===incoming.s;
 const oldTime=old?.source_updated_at||(old?.stock_observation_provenance==='SUPPLIER_FIELD'?old.stock_observed_at:null),newTime=incoming.source_updated_at||incoming.stock_observed_at;
 const priorValid=prior?.availability_confirmation==='CONFIRMED';
 if(same&&(manual||old?.availability_manual===true||priorValid&&(next.availability_confirmation!=='CONFIRMED'||oldTime&&newTime&&newTime<=oldTime))){
  return {observation:prior||next,retained:true,warning:manual?'MANUAL_INVENTORY_LOCK':next.availability_confirmation!=='CONFIRMED'?'INVALID_AVAILABILITY_RETAINED':newTime<oldTime?'OLDER_OBSERVATION_IGNORED':'SAME_OBSERVATION_RETAINED'};
 }
 if(same&&priorValid&&next.availability_confirmation==='CONFIRMED'&&!newTime&&JSON.stringify(next)===JSON.stringify(resolve(p,old)))return {observation:prior,retained:true,warning:null};
 return {observation:next,retained:false,warning:null};
}
function quantity(raw){if(typeof raw==='number')return validQuantity(raw)?raw:null;const text=String(raw??'').trim().replace(/[\s\u00a0\u202f]/g,'');if(!/^\d+(?:[.,]\d+)?$/.test(text))return null;const n=Number(text.replace(',','.'));return validQuantity(n)?n:null;}
return {version,defaults,policy,resolve,observe,retain,validQuantity,quantity};
});
