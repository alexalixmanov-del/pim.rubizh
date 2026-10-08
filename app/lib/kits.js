/* Pure kit planning and validation. Shared by the browser and regression tests. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RubizhKits=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const ROLE_LABELS={ubacs:'Бойова сорочка',pants:'Штани',magazine:'Підсумок для магазину',backpack:'Рюкзак',protection:'Плитоноска / бронежилет',plate:'Бронеплити',ifak:'Укомплектована аптечка',thermal:'Термобілизна',fleece:'Фліс',gloves:'Рукавички',outer:'Верхній одяг'};
  const SPECS={
    b1:{roles:['ubacs','pants','magazine','backpack'],budget:[8000,12000],season:'Літо'},
    b2:{roles:['protection','ubacs','ifak'],budget:[12000,25000],season:null},
    b3:{roles:['thermal','fleece','gloves','outer'],budget:[7000,12000],season:'Зима'}
  };
  const LETTERS=['XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL','6XL','7XL','8XL','9XL'];
  const CLOTHING=new Set(['ubacs','pants','thermal','fleece','outer']);
  const PALETTES=['ММ14','Піксель','Мультикам','Олива','Койот','Чорний'];
  const string=v=>String(v??'').trim();
  const unique=a=>[...new Set(a)];
  const variants=p=>Array.isArray(p?.variants)?p.variants:Object.values(p?.variants||{});
  const attrs=p=>({...p?.legacy_attributes,...(p?.attributes||p?.attrs||{}),...p?.compatibility});
  const text=p=>string(p?.name)+' '+Object.entries(attrs(p)).map(([k,v])=>k+': '+v).join(' ');
  const asLetter=s=>string(s).toUpperCase().replace(/^2XL$/,'XXL').replace(/^XXXL$/,'3XL');
  function letters(v){
    if(v.size_unconfirmed)return [];
    const explicit=Array.isArray(v.size_letters)?v.size_letters:[];
    const confirmed=unique(explicit.map(asLetter).filter(x=>LETTERS.includes(x)));
    if(confirmed.length)return confirmed;
    const raw=asLetter(v.size_normalized||v.size_native||v.size_display||v.size||'');
    if(LETTERS.includes(raw))return [raw];
    const range=raw.split(/\s*[-–/]\s*/).map(asLetter);
    if(range.length===2&&range.every(x=>LETTERS.includes(x))){
      const a=LETTERS.indexOf(range[0]),b=LETTERS.indexOf(range[1]);
      if(a<=b)return LETTERS.slice(a,b+1);
    }
    return [];
  }
  function live(v){
    return v?.availability==='in_stock'&&!v.stock_stale&&!v.source_review&&Number.isFinite(Number(v.price))&&Number(v.price)>0&&!(typeof v.stock==='number'&&(!Number.isFinite(v.stock)||v.stock<=0));
  }
  function preorderDays(v){
    const raw=v.lead_time_days??v.lead_time;
    const m=string(raw).match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?:\s+(?:днів|дні|дня|дней|days|робочі дні|робочих днів|рабочих дней))?$/iu);
    if(!m||+m[1]<1||+m[1]>365||m[2]&&(+m[2]<+m[1]||+m[2]>365))return null;
    return +(m[2]||m[1]);
  }
  function available(v,b={}){
    return live(v)||b.allowPreorder===true&&v.availability==='preorder'&&v.preorder_confirmed===true&&!v.source_review&&preorderDays(v)!==null&&preorderDays(v)<=Number(b.maxPreorderDays??3)&&Number.isFinite(Number(v.price))&&Number(v.price)>0;
  }
  function selected(p,color,b={}){return variants(p).filter(v=>available(v,b)&&(!color||string(v.camouflage||v.color)===string(color)));}
  function sizeFree(p){return /пончо|бахіл/iu.test(p?.name||'');}
  function sizeSet(p,color,b){return unique(selected(p,color,b).flatMap(letters)).sort((a,b)=>LETTERS.indexOf(a)-LETTERS.indexOf(b));}
  function heights(v){
    const raw=string(v.height||v.size_height);if(!raw)return v.size_fit?['fit:'+v.size_fit]:null;
    if(/^[1-6]$/.test(raw))return [raw];
    const m=raw.match(/^([1-6])\s*[-–]\s*([1-6])$/);
    return m&&+m[1]<=+m[2]?Array.from({length:+m[2]-+m[1]+1},(_,i)=>String(+m[1]+i)):['raw:'+raw];
  }
  function commonHeights(entries,size,b){
    let shared=null;
    for(const {p,item} of entries){
      const vs=(entries.find(e=>e.p===p&&e.item===item)?.vs||selected(p,item.color,b)).filter(v=>letters(v).includes(size));
      if(vs.some(v=>heights(v)===null))continue;
      const available=new Set(vs.flatMap(heights));
      shared=shared===null?available:new Set([...shared].filter(h=>available.has(h)));
    }
    return shared;
  }
  function policy(b){
    const spec=SPECS[b?.id];
    if(!spec)return null;
    const budget=[b.budgetMin??spec.budget[0],b.budgetMax??spec.budget[1]].map(Number);
    const minSizes=Number(b.minCommonSizes??3);
    const maxDays=Number(b.maxPreorderDays??3);
    return {...spec,budget,minSizes,valid:budget.every(Number.isFinite)&&budget[0]>=0&&budget[1]>=budget[0]&&Number.isInteger(minSizes)&&minSizes>=1&&minSizes<=8&&Number.isInteger(maxDays)&&maxDays>=1&&maxDays<=365};
  }
  function plateCount(p){
    const a=attrs(p),explicit=a['Кількість плит у комплекті']??a['Кількість бронеплит']??a['Кількість плит'];
    if(explicit!=null&&/^[12]$/.test(string(explicit)))return Number(explicit);
    const m=text(p).match(/(?:комплект\s+(?:із\s+|з\s+)?|)(2|дві|двох)\s+(?:броне)?плит/iu);
    return m?2:1;
  }
  function dimensions(p,carrier){
    const a=attrs(p),keys=carrier?['plate_size_supported','Розмір плит','Розміри сумісних плит','Розміри плит','Формат плит','Сумісність']:['plate_size','Розмір плит','Розміри плит','Габарити','Розмір виробу'];
    const values=keys.map(k=>a[k]).filter(Boolean);
    if(!carrier)values.push(...variants(p).map(v=>v.size_native||v.size||v.size_display));
    const out=[];
    for(const value of values){
      const s=string(value);
      const dims=s.match(/(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?)(?:\s*[×xх*]\s*\d+(?:[.,]\d+)?)?\s*(мм|mm|см|cm)?/iu);
      // Unitless variant dimensions require an explicit specification; never assume cm.
      if(dims&&dims[3]){const factor=/мм|mm/iu.test(dims[3])?.1:1;out.push([+dims[1].replace(',','.')*factor,+dims[2].replace(',','.')*factor].sort((a,b)=>a-b).map(n=>Math.round(n*100)/100).join('x')+'cm');}
      const standard=s.match(/\b(?:SAPI|ESAPI)\s*[- ]?\s*(XS|S|M|L|XL)\b/iu);
      if(standard)out.push('SAPI '+standard[1].toUpperCase());
    }
    return unique(out).sort();
  }
  function evidenceSignature(p){
    const a=attrs(p);
    return JSON.stringify([p?.id,p?.name,Object.keys(a).sort().map(k=>[k,a[k]]),variants(p).map(v=>[v.sku,v.size_native,v.size_display,v.size,v.color,v.camouflage]).sort((a,b)=>string(a[0]).localeCompare(string(b[0])))]);
  }
  function compatibility(carrier,plate,b){
    const manualNegative=[carrier,plate].some((p,i)=>(p?.compatibility?.incompatible_product_ids||[]).includes(i?carrier.id:plate.id)||(p?.relations||[]).some(r=>r.type==='incompatible'&&r.product_id===(i?carrier.id:plate.id)));
    if(manualNegative)return {ok:false,unknown:false,source:'manual'};
    const manualPositive=[carrier,plate].some((p,i)=>(p?.compatibility?.compatible_product_ids||[]).includes(i?carrier.id:plate.id)||(p?.relations||[]).some(r=>r.type==='compatible'&&r.product_id===(i?carrier.id:plate.id)));
    if(manualPositive)return {ok:true,unknown:false,source:'manual'};
    const a=dimensions(carrier,true),d=dimensions(plate,false);
    if(a.length&&d.length)return {ok:a.some(x=>d.includes(x)),unknown:false,carrier:a,plate:d};
    const checks=b?.compatibilityChecks||[];
    const checked=checks.some(c=>c.carrierId===carrier.id&&c.plateId===plate.id&&c.carrierSignature===evidenceSignature(carrier)&&c.plateSignature===evidenceSignature(plate));
    return {ok:checked,unknown:!checked,carrier:a,plate:d};
  }
  function variantCompatibility(carrier,plate,v,b){
    const manual=compatibility(carrier,plate,b);if(manual.source==='manual')return manual;
    const explicit=dimensions({variants:[v]},false);
    if(!explicit.length)return compatibility(carrier,plate,b);
    const a=dimensions(carrier,true);
    if(!a.length)return compatibility(carrier,plate,b);
    return {ok:a.some(x=>explicit.includes(x)),unknown:false};
  }
  function quantity(item){const q=item.quantity??1;return typeof q==='number'&&Number.isInteger(q)&&q>=1&&q<=10?q:null;}
  function validate(b,products,options={}){
    const issues=[],warnings=[],entries=[],byId=new Map(products.map(p=>[p.id,p])),seen=new Set(),spec=policy(b);
    if(!spec||!spec.valid)issues.push('Перевірте шаблон, бюджет і мінімальну кількість спільних розмірів');
    if(!string(b?.name)||string(b.name).length>24)issues.push('Назва: від 1 до 24 символів');
    if(string(b?.note).length>80)issues.push('Підпис: до 80 символів');
    const items=Array.isArray(b?.items)?b.items:[];
    if(items.length<2||items.length>8)issues.push('Потрібно 2–8 товарів');
    for(const role of spec?.roles||[])if(items.filter(it=>it.role===role).length!==1)issues.push('Потрібна одна позиція: '+ROLE_LABELS[role]);
    if(options.compatibility)for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=byId.get(items[i].product_id),c=byId.get(items[j].product_id);if(a&&c&&options.compatibility(a,c)?.status==='incompatible')issues.push('Несумісні товари: '+(a.name||a.id)+' / '+(c.name||c.id));}
    for(const item of items){
      const p=byId.get(item.product_id),label=p?.name||item.product_id||'позиція';
      if(seen.has(item.product_id))issues.push('Товар повторюється: '+label);seen.add(item.product_id);
      if(!ROLE_LABELS[item.role])issues.push('Оберіть роль: '+label);
      if(!p){issues.push('Товар зник із доступного каталогу: '+label);continue;}
      if(options.eligible&&!options.eligible(p))issues.push('Товар не готовий до комплекту: '+label);
      if(options.role&&options.role(p)!==item.role)issues.push('Товар не відповідає ролі «'+(ROLE_LABELS[item.role]||item.role)+'»: '+label);
      if(!string(p.description||p.desc))issues.push('Немає опису: '+label);
      if(spec?.season&&options.seasonOK&&!options.seasonOK(p,spec.season))issues.push('Не відповідає сезону «'+spec.season+'»: '+label);
      if(spec?.season&&CLOTHING.has(item.role)&&options.seasons&&!options.seasons(p).length)warnings.push('Сезон не підтверджено: '+label);
      const q=quantity(item);if(q===null)issues.push('Кількість має бути цілим числом від 1 до 10: '+label);
      const vs=selected(p,item.color,b),colors=unique(vs.map(v=>string(v.camouflage||v.color)));
      if(!vs.length)issues.push('Немає в наявності вибраного кольору: '+label);
      if(!item.color&&colors.length>1)issues.push('Оберіть конкретний колір: '+label);
      if(CLOTHING.has(item.role)&&!sizeFree(p)&&sizeSet(p,item.color,b).length<(spec?.minSizes||3))issues.push('Недостатньо підтверджених розмірів: '+label);
      const filling=string(attrs(p)['Комплектація']||attrs(p)['Склад аптечки']);
      if(item.role==='ifak'&&(/без наповнення|без вмісту|порожн|без наполнения|пустая/iu.test(text(p))||!filling||!/турнікет|турникет|джгут|жгут|бинт|бандаж|серветк|салфетк|пластир|пластыр|оклюзійн|окклюзион|декомпресі|ножиц|рукавич|термоковдр|tourniquet|bandage|gauze|chest seal|CAT\b/iu.test(filling)))issues.push('Не підтверджено наповнення аптечки: '+label);
      const palette=options.palette?.(item.color);
      if(b.palette&&b.palette!=='Будь-яка'&&item.color&&palette!==b.palette&&!['plate','ifak','gloves'].includes(item.role)&&!(colors.length===1&&!palette))issues.push('Колір не відповідає гамі «'+b.palette+'»: '+label);
      if(vs.some(v=>v.availability==='in_stock'&&v.stock==null))warnings.push('Кількість на складі не підтверджена: '+label);
      if(vs.some(v=>v.availability==='preorder'))warnings.push('Під замовлення до '+Math.max(...vs.filter(v=>v.availability==='preorder').map(preorderDays))+' днів: '+label);
      if(q!==null&&vs.length&&vs.every(v=>v.availability!=='preorder'&&typeof v.stock==='number'&&v.stock<q))issues.push('Недостатній залишок для кількості '+q+': '+label);
      entries.push({p,item,vs:vs.filter(v=>v.availability==='preorder'||typeof v.stock!=='number'||q===null||v.stock>=q),q:q||1});
    }
    const camo=new Set(entries.map(({item})=>options.palette?.(item.color)).filter(x=>['ММ14','Піксель','Мультикам'].includes(x)));
    if(camo.size>1)issues.push('Піксель і мультикам не поєднуємо в одному комплекті');
    const carriers=entries.filter(e=>e.item.role==='protection'),plates=entries.filter(e=>e.item.role==='plate');
    for(const carrier of carriers){
      if(options.hasPlates?.(carrier.p)){
        const explicit=attrs(carrier.p)['Кількість плит у комплекті'];
        const confirmed=b?.includedPlateChecks?.some(c=>c.productId===carrier.p.id&&c.signature===evidenceSignature(carrier.p)&&c.count>=2);
        if(plateCount(carrier.p)<2&&!(Number(explicit)>=2)&&!confirmed)issues.push('Підтвердіть дві плити в поставці: '+carrier.p.name);
        if(plates.length)issues.push('До бронекомплекту з плитами не додавайте зайві плити без зміни шаблону');
      }else{
        if(plates.length!==1)issues.push('До плитоноски потрібна одна позиція бронеплит');
        for(const plate of plates){
          if(plateCount(plate.p)*plate.q<2*carrier.q)issues.push('Потрібні дві бронеплити на кожну плитоноску: '+plate.p.name);
          const compatible=plate.vs.filter(v=>variantCompatibility(carrier.p,plate.p,v,b).ok);
          const match=compatibility(carrier.p,plate.p,b);
          if(!match.ok)issues.push(match.unknown?'Підтвердіть сумісність плитоноски та плит за специфікацією':'Розміри плитоноски та плит несумісні');
          if(match.ok&&!compatible.length)issues.push('Немає доступного варіанта плит, сумісного з плитоноскою');
          plate.vs=compatible;
        }
      }
    }
    if(!carriers.length&&plates.length)issues.push('Бронеплити додані без плитоноски / бронежилета');
    const clothes=entries.filter(e=>CLOTHING.has(e.item.role)&&!sizeFree(e.p));
    let shared=null;
    for(const e of clothes){const set=new Set(e.vs.flatMap(letters));shared=shared===null?set:new Set([...shared].filter(x=>set.has(x)));}
    let commonSizes=shared?[...shared].sort((a,b)=>LETTERS.indexOf(a)-LETTERS.indexOf(b)):[];
    commonSizes=commonSizes.filter(size=>commonHeights(clothes,size)?.size!==0);
    if(clothes.length&&commonSizes.length<(spec?.minSizes||3))issues.push('Потрібно '+(spec?.minSizes||3)+' спільні розміри одягу з сумісним зростом; зараз '+commonSizes.length);
    const candidates=commonSizes.length?commonSizes:[null],totals=[];
    const choicesFor=(e,size)=>e.vs.filter(v=>{
      if(!size||!CLOTHING.has(e.item.role)||sizeFree(e.p))return true;
      if(!letters(v).includes(size))return false;
      const h=heights(v),common=commonHeights(clothes,size);
      return !h||!common||h.some(x=>common.has(x));
    });
    for(const size of candidates){
      let total=0,max=0;for(const e of entries){const vs=choicesFor(e,size);if(!vs.length){total=NaN;break;}total+=Math.min(...vs.map(v=>Number(v.price)))*e.q;max+=Math.max(...vs.map(v=>Number(v.price)))*e.q;}
      if(Number.isFinite(total))totals.push({size,total:Math.round(total*100)/100,max:Math.round(max*100)/100});
    }
    const validTotals=spec?.valid?totals.filter(t=>t.total>=spec.budget[0]&&t.max<=spec.budget[1]):[];
    if(totals.length&&!validTotals.length)issues.push('Сума '+Math.min(...totals.map(t=>t.total))+' ₴ поза бюджетом '+(spec?.budget||[]).join('–')+' ₴');
    if(clothes.length&&validTotals.length<(spec?.minSizes||3)&&validTotals.length>0)issues.push('У межах бюджету доступні лише '+validTotals.length+' спільні розміри');
    const sizes=validTotals.map(t=>t.size).filter(Boolean);
    const allowedItems=entries.map(e=>({...e.item,quantity:e.q,allowed_skus:unique(validTotals.flatMap(t=>choicesFor(e,t.size)).map(v=>v.sku).filter(Boolean))}));
    if(entries.some(e=>e.item.role==='protection'&&/реплік|страйкбол/iu.test(e.p.name)))issues.push('Репліка не підходить для бронезахисту');
    if(allowedItems.some(it=>!it.allowed_skus.length))issues.push('Немає підтверджених артикулів у межах бюджету');
    const commonHeightMap=Object.fromEntries(sizes.map(s=>[s,commonHeights(clothes,s)?[...commonHeights(clothes,s)]:null]));
    const days=entries.flatMap(e=>e.vs.filter(v=>v.availability==='preorder').map(preorderDays)),leadDays=days.length?Math.max(...days):0;
    return {ok:issues.length===0,issues:unique(issues),warnings:unique(warnings),availability:leadDays?'preorder':'in_stock',leadDays,commonSizes:sizes,commonHeights:commonHeightMap,totals:validTotals,minTotal:validTotals.length?Math.min(...validTotals.map(t=>t.total)):null,maxTotal:validTotals.length?Math.max(...validTotals.map(t=>t.max)):null,items:allowedItems};
  }
  function plan(drafts,products,options={}){
    return drafts.map(original=>{
      const b=structuredClone(original),spec=policy(b);
      if(b.locked)return {...b,planning:{skipped:true,message:'Ручний склад зафіксовано'}};
      if(!spec?.valid)return {...b,planning:{message:'Перевірте шаблон і бюджет'}};
      const target=(spec.budget[0]+spec.budget[1])/2;
      const eligible=products.filter(p=>(!b.budgetTier||p.budget_tier===b.budgetTier)&&(!options.eligible||options.eligible(p))&&string(p.description||p.desc)&&(!spec.season||!options.seasonOK||options.seasonOK(p,spec.season))).sort((a,b)=>string(a.id).localeCompare(string(b.id)));
      const palettes=b.palette&&b.palette!=='Будь-яка'?[b.palette]:PALETTES;
      const missing=spec.roles.filter(role=>!eligible.some(p=>options.role?.(p)===role&&selected(p,'',b).length));
      if(missing.length)return {...b,items:[],planning:{message:'Немає доступних позицій: '+missing.map(r=>ROLE_LABELS[r]).join(', '),missingRoles:missing}};
      const complete=[];
      for(const palette of palettes){
        const choices=role=>eligible.filter(p=>options.role?.(p)===role).flatMap(p=>{
          const colors=unique(selected(p,'',b).map(v=>string(v.camouflage||v.color))).sort();
          return colors.filter(color=>['plate','ifak','gloves'].includes(role)||options.palette?.(color)===palette||colors.length===1&&!options.palette?.(color)).map(color=>{
            const item={product_id:p.id,role,color,quantity:role==='plate'?Math.ceil(2/plateCount(p)):1};
            const vs=selected(p,color,b).filter(v=>v.availability==='preorder'||typeof v.stock!=='number'||v.stock>=item.quantity);
            if(!vs.length||CLOTHING.has(role)&&!sizeFree(p)&&sizeSet(p,color,b).length<spec.minSizes)return null;
            const price=Math.min(...vs.map(v=>Number(v.price)))*item.quantity;
            return {p,item,price};
          }).filter(Boolean);
        }).sort((a,b)=>Math.abs(a.price-target/spec.roles.length)-Math.abs(b.price-target/spec.roles.length)||(+options.priority?.(b.p)||0)-(+options.priority?.(a.p)||0)||string(a.p.id).localeCompare(string(b.p.id))||a.item.color.localeCompare(b.item.color)).slice(0,24);
        let beam=[{items:[],total:0,ids:new Set()}];
        for(const role of spec.roles){
          const pool=choices(role),next=[];
          if(!pool.length){beam=[];break;}
          for(const state of beam)for(const choice of pool){
            if(state.ids.has(choice.p.id))continue;
            const needsPlate=role==='protection'&&!options.hasPlates?.(choice.p);
            const addPlates=needsPlate?choices('plate').filter(x=>!state.ids.has(x.p.id)&&x.p.id!==choice.p.id&&(()=>{const c=compatibility(choice.p,x.p,b);return c.ok||c.unknown;})()):[null];
            for(const plate of addPlates){
              const added=[choice,...(plate?[plate]:[])],total=state.total+added.reduce((s,x)=>s+x.price,0);
              if(total>spec.budget[1])continue;
              const items=[...state.items,...added.map(x=>x.item)],clothes=items.filter(x=>CLOTHING.has(x.role)).map(item=>({item,p:eligible.find(p=>p.id===item.product_id)})).filter(e=>!sizeFree(e.p));
              const shared=clothes.length?sizeSet(clothes[0].p,clothes[0].item.color,b).filter(size=>clothes.every(e=>sizeSet(e.p,e.item.color,b).includes(size))&&commonHeights(clothes,size,b)?.size!==0):[];
              if(clothes.length&&shared.length<spec.minSizes)continue;
              next.push({items,total,ids:new Set([...state.ids,...added.map(x=>x.p.id)])});
            }
          }
          const progress=(spec.roles.indexOf(role)+1)/spec.roles.length;
          next.sort((a,c)=>Math.abs(a.total-target*progress)-Math.abs(c.total-target*progress)||JSON.stringify(a.items).localeCompare(JSON.stringify(c.items)));
          beam=next.slice(0,128);
          if(!beam.length)break;
        }
        for(const state of beam){const candidate={...b,palette,items:state.items},check=validate(candidate,products,options);complete.push({candidate,check,score:check.issues.length*1e7+Math.abs(state.total-target),priority:state.items.reduce((sum,it)=>sum+(+options.priority?.(products.find(p=>p.id===it.product_id))||0),0)});}
      }
      complete.sort((a,c)=>a.score-c.score||(c.priority||0)-(a.priority||0)||JSON.stringify(a.candidate.items).localeCompare(JSON.stringify(c.candidate.items)));
      const seen=new Set(),best=complete.filter(x=>{const key=JSON.stringify(x.candidate.items);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,3);
      if(!best.length)return {...b,items:[],planning:{message:'Немає повного поєднання в бюджеті, кольорі та наявності. Змініть бюджет або оновіть прайс.'}};
      return {...best[0].candidate,alternatives:best.slice(1).map(x=>({palette:x.candidate.palette,items:x.candidate.items})),planning:{message:best[0].check.ok?'Склад готовий до перевірки та затвердження':'Склад підібрано; потрібна перевірка: '+best[0].check.issues.join(' · '),searchLimited:true}};
    });
  }
  return {ROLE_LABELS,SPECS,PALETTES,policy,validate,plan,letters,live,available,preorderDays,selected,sizeSet,compatibility,evidenceSignature,plateCount};
});
