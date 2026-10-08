'use strict';
// In-memory contract mock. It never contacts the shop or reserves production stock.
const Ajv=require('ajv'),schema=require('../contracts/category-size-export.schema.json');
function createMockShop({now=Date.now}={}){
 const validate=new Ajv({strict:false}).compile(schema),products=new Map(),orders=new Map();let next=0;
 const valid=v=>v.inventory_policy_confirmed&&v.availability_confirmation==='CONFIRMED'&&v.availability_status==='IN_STOCK'&&v.source_binding_status==='CONFIRMED'&&v.price_ready&&(v.availability_source!=='QUANTITY'||v.stock_quantity>0)&&(!v.expires_at||now()<v.expires_at);
 return {
  status(){return {mock:true,production_writes:0,capabilities:{contract_version:3,order_policy_version:1,inventory_policy_version:1,category_catalog_version:2,size_catalog_version:1}};},
  sync(){throw Error('REVIEW_ONLY: /pim/sync blocked');},
  loadFixture(items){for(const p of items){if(!validate(p))throw Error('CONTRACT_INVALID: '+JSON.stringify(validate.errors));products.set(p.id,structuredClone(p));}},
  submit({product_id,sku,option_id,size,color_id}){
   const p=products.get(product_id),v=p?.variants.find(v=>v.sku===sku),option=!sku&&p?.size_options.find(o=>o.option_id===option_id),item=v||option;
   if(!item?.order_submission_allowed)throw Error('ORDER_SUBMISSION_FORBIDDEN');
   if(size!=null&&String(size)!==String(item.size??'')||color_id!=null&&color_id!==item.color_id)throw Error('SELECTION_MISMATCH');
   if(v?.payment_allowed&&!valid(v))throw Error('STOCK_NO_LONGER_CONFIRMED');
   if(v&&(!(v.price>0)||!Number.isFinite(v.price)))throw Error('INVALID_PRICE');
   const id='mock-order-'+(++next),order={id,product_id,sku:v?.sku||null,option_id:option?.option_id||null,selected_size:item.size||null,selected_color_id:item.color_id||null,price:v?.price??null,status:item.requires_order_confirmation?'PENDING_MANAGER':'READY_FOR_PAYMENT',manager_confirmed:false,payment_allowed:item.payment_allowed};orders.set(id,order);return structuredClone(order);
  },
  confirmByManager(id,{sku,price}){
   const o=orders.get(id),p=products.get(o?.product_id),v=p?.variants.find(v=>v.sku===sku);
   if(!o||!v||o.sku&&o.sku!==sku||o.selected_size&&String(v.size)!==String(o.selected_size)||o.selected_color_id&&v.color_id!==o.selected_color_id||v.source_binding_status!=='CONFIRMED'||!['EXACT_SIZE','ONE_SIZE','NO_SIZE_REQUIRED'].includes(v.size_status)||!Number.isFinite(price)||price<=0||price!==v.price||!['PREORDER','ORDER_ON_REQUEST','IN_STOCK'].includes(v.availability))throw Error('MANAGER_CONFIRMATION_INVALID');
   Object.assign(o,{sku,price,selected_size:v.size||null,selected_color_id:v.color_id||null,manager_confirmed:true,payment_allowed:true,status:'READY_FOR_PAYMENT'});return structuredClone(o);
  },
  pay(id){const o=orders.get(id),p=products.get(o?.product_id),v=p?.variants.find(v=>v.sku===o.sku);if(!o||o.status!=='READY_FOR_PAYMENT'||!o.payment_allowed||!v||v.price!==o.price||o.selected_size&&String(v.size)!==String(o.selected_size)||o.selected_color_id&&v.color_id!==o.selected_color_id||!v.payment_allowed&&!o.manager_confirmed||v.payment_allowed&&!valid(v)||v.availability==='OUT_OF_STOCK'||v.availability==='UNKNOWN'||v.availability==='SIZE_CONFIRMATION_REQUIRED')throw Error('PAYMENT_FORBIDDEN');o.status='PAID';return structuredClone(o);},
  getOrder(id){return structuredClone(orders.get(id));}
 };
}
module.exports={createMockShop};
