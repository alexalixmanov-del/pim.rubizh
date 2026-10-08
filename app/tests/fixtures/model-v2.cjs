'use strict';
const V2=require('../../lib/model-contract-v2.js');
function fixture(){
 const categories=[{id:'clothing',name:'Одяг',parent_id:null},{id:'clothing_jackets',name:'Куртки',parent_id:'clothing'}];
 const products=['black','olive','multicam'].map((color,i)=>({id:'old-'+color,slug:'old-husky-'+color,name:'Куртка Archon Husky Extreme '+color,brand:'Archon',desc:'Зимова куртка',canonical_category_id:'clothing_jackets',photos:['https://images.test/'+color+'.jpg'],manual_locks:{category:true},variants:['M','L'].map((size,j)=>({id:'oldv-'+i+'-'+j,sku:'RUB-'+i+'-'+j,size,color,price:4350+i,stock:4+j,availability:'IN_STOCK',offers:{supplier:{s:'SUP-'+i+'-'+j,stock:4+j,cost:1500}}}))}));
 const source=V2.source({products:products.map(p=>({...p,legacy_urls:['/product/'+p.slug]})),cfg:{category_engine:{version:1,migration_validated:true},supplier_category_mapping:[{supplier_id:'supplier',confirmed:true}],siteApi:{key:'TEST_SECRET'}}},categories);
 const registry=V2.draft(source),model={...registry.models[0],model_id:'mdl_husky',marketing_name_uk:'Тактична куртка Archon Husky Extreme',slug:'archon-husky',size_policy:'REQUIRED',publication_status:'PUBLISHED',mapping_status:'CONFIRMED'};
 registry.models=[model];registry.colors=products.map(p=>({model_id:model.model_id,color_id:'clr_'+p.variants[0].color,color:p.variants[0].color,camouflage:p.variants[0].color==='multicam'?'multicam':null,mapping_status:'CONFIRMED'}));
 for(const m of registry.product_mappings){m.model_id=model.model_id;m.color_id='clr_'+m.legacy_product_id.slice(4);m.mapping_status='CONFIRMED';}
 for(const m of registry.variant_mappings){m.model_id=model.model_id;m.color_id='clr_'+m.legacy_product_id.slice(4);m.mapping_status='CONFIRMED';}
 for(const m of registry.photo_mappings){const p=source.photos.find(p=>p.legacy_photo_id===m.legacy_photo_id);m.model_id=model.model_id;m.color_id='clr_'+p.legacy_product_id.slice(4);m.mapping_status='CONFIRMED';}
 return {source,registry,products};
}
module.exports={fixture};
