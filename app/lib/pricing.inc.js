/* ===================== цены ===================== */
const OWNER_PRICE_POLICY={pricing_policy_version:1,minMargin:30,bigPriceFrom:10000,bigPriceMargin:25,kitMargin:20,discountMarginFloor:15,donPct:3,donPctBig:3,donFrom:0,donMode:'check',donProgressive:false,donSkipWholesale:false,tiers:'12, 18'};
function pricingProtected(cfg=S.cfg){return cfg.pricing_policy_version===1;}
function discountMarginFloor(cfg=S.cfg){return pricingProtected(cfg)?Math.max(15,Number(cfg.discountMarginFloor)||15):0;}
function priceFinancial(price,payout,cfg=S.cfg,opts={}){
 const fees=price*(Math.max(0,+cfg.taxPct||0)+Math.max(0,+cfg.acquiringPct||0))/100;
 const fixed=Math.max(0,+cfg.deliveryCost||0)+Math.max(0,+cfg.extraCost||0);
 const before=price-payout-fees-fixed;
 const donation=opts.skipDonation?0:donationFor(price,before,cfg,opts).donation;
 const profit=before-donation;return {price,payout,fees,fixed,donation,profit,margin:price>0?profit/price*100:-Infinity};
}
// A public sale-price floor contains no supplier cost. Reserve 0.50 UAH for
// rounding the donation once for a whole order, including multiple quantities.
function discountedPriceFloor(p,v,cfg=S.cfg){
 const c=calc(p,v,cfg);if(!(c.price>0)||!(c.payout>0))return null;
 if(!pricingProtected(cfg))return c.minPrice;
 const floor=discountMarginFloor(cfg),safe=price=>{const f=priceFinancial(price,c.payout,cfg);const reserve=f.donation?0.5:0;return f.profit-reserve+1e-8>=price*floor/100;};
 const fee=(Math.max(0,+cfg.taxPct||0)+Math.max(0,+cfg.acquiringPct||0))/100;
 const donation=Math.max(0,+cfg.donPct||0)/100;
 const denominator=1-fee-donation-floor/100;
 const mandatory=c.ref&&rrpRequired(c.ref.sid,cfg)?c.rrp||0:0;
 if(cfg.donMode!=='profit'&&!(+cfg.donFrom>0)&&denominator>0){
  const fixed=Math.max(0,+cfg.deliveryCost||0)+Math.max(0,+cfg.extraCost||0);
  const price=roundPriceAtLeast108(Math.max((c.payout+fixed+(donation?0.5:0))/denominator,mandatory),cfg);
  if(safe(price))return price;
 }
 let lo=Math.max(0,c.payout),hi=Math.max(c.price,lo*2,1);
 for(let i=0;i<40&&!safe(hi);i++)hi*=2;
 if(!safe(hi))return null;
 for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(safe(mid))hi=mid;else lo=mid;}
 let price=roundPriceAtLeast108(Math.max(hi,mandatory),cfg);
 for(let i=0;i<20&&!safe(price);i++)price=roundPriceAtLeast108(price+Math.max(+cfg.round||0,0.01),cfg);
 return safe(price)?price:null;
}
function variantPricingPayload(p,v,cfg=S.cfg){
 if(!pricingProtected(cfg))return {};
 return {pricing_policy_version:1,discount_margin_floor_pct:discountMarginFloor(cfg),minimum_sale_price:discountedPriceFloor(p,v,cfg)};
}
async function ensurePricingPolicy(){
 if(pricingProtected()){S.pricingPolicyError='';return false;}
 if(S.snap||S.edit||S.imp?.rows)throw Error('Завершите редактирование или импорт перед изменением правил цен.');
 const backup=fullStateData('До правил маржи 30 / 25 / 20');
 let changed=false;
 try{
  await requireBatchBackup('Перед правилами маржи 30 / 25 / 20');
  await Store.set('safety/before_pricing_30_25_20',backup);
  changed=true;
  Object.assign(S.cfg,OWNER_PRICE_POLICY);S.cfgDirty=true;S.priceDraft=null;S.ui.quoteTarget=Math.max(15,Number(S.ui.quoteTarget)||15);S.ui.quoteDon=true;bumpData();
  if(!await persist())throw Error('Новые правила цен не сохранены.');
  const stored=await Store.get('meta/config');if(Object.keys(OWNER_PRICE_POLICY).some(k=>stored?.[k]!==OWNER_PRICE_POLICY[k]))throw Error('Сохранение правил цен не подтверждено.');
  S.pricingPolicyError='';toast('Применена маржа 30% / 25% / 20%. Скидки защищены остатком 15% после доната.');return true;
 }catch(error){S.pricingPolicyError=error.message||String(error);if(changed){loadStateData(backup);markAllDirty();await persist();}throw error;}
}
async function savePriceSettings(){
 readPrices();if(!S.priceDraft)return false;
 const draft=structuredClone(S.priceDraft),before=structuredClone(S.cfg);
 for(const key of ['taxPct','acquiringPct','minMargin','bigPriceMargin','kitMargin','discountMarginFloor','donPct'])if(!Number.isFinite(draft[key])||draft[key]<0||draft[key]>=100)throw Error('Некорректный процент: '+key);
 const fees=draft.taxPct+draft.acquiringPct;
 if(fees+Math.max(draft.minMargin,draft.bigPriceMargin,draft.kitMargin)>=100||fees+draft.donPct+draft.discountMarginFloor>=100)throw Error('Маржа, комиссии и донат не оставляют места для закупки. Исправьте проценты.');
 await requireBatchBackup('Перед изменением настроек цен');
 try{Object.assign(S.cfg,draft,{pricing_policy_version:1});S.cfgDirty=true;bumpData();if(!await persist())throw Error('Настройки цен не сохранены.');S.priceDraft=null;toast('Цены пересчитаны и сохранены');return true;}
 catch(error){S.cfg=before;S.cfgDirty=true;S.priceDraft=draft;bumpData();await persist();throw error;}
}
function ruleMarkup(p, sid, cfg){
  if (p && p.markup != null && p.markup !== "" && isFinite(+p.markup)) return +p.markup;
  let best = null;
  for (const r of cfg.rules || []){
    const hit = r.scope === "category" ? categoryPriceScope(p,r)
      : r.scope === "brand" ? norm(r.value) === norm(p.brand)
      : r.scope === "supplier" ? r.value === sid : false;
    if (hit && (!best || (+r.priority || 0) > (+best.priority || 0))) best = r;
  }
  return best ? +best.markup : +cfg.defaultMarkup;
}
const roundUp = (x, step) => step > 0 ? Math.ceil(x / step) * step : Math.round(x * 100) / 100;
function roundPrice(x, cfg){ const step = +cfg.round; let v = roundUp(x, step); if (cfg.roundMode === "nine" && step >= 10) v -= 1; return v; }
function roundPriceAtLeast108(x,cfg){const rounded=roundPrice(x,cfg);return rounded+1e-8>=x?rounded:roundPrice(x+Math.max(+cfg.round||0,0.01),cfg);}
function tierList(cfg = S.cfg){ return String(cfg.tiers || "").split(/[,; ]+/).map(Number).filter(n => n > 0 && n < 100); }
function tierPrices(price, cfg=S.cfg,p=null,v=null){
 if(price==null)return [];
 if(!pricingProtected(cfg))return tierList(cfg).map(d=>({discount:d,price:roundPrice(price*(1-d/100),cfg)}));
 if(!p||!v)return [];
 const floor=discountedPriceFloor(p,v,cfg);if(floor==null||floor>=price)return [];
 const seen=new Set();return tierList(cfg).flatMap(d=>{
  const candidate=Math.max(roundPrice(price*(1-d/100),cfg),floor);
  if(candidate>=price||seen.has(candidate)||priceFinancial(candidate,calc(p,v,cfg).payout,cfg,{wholesale:true}).margin+1e-8<discountMarginFloor(cfg))return [];
  seen.add(candidate);return [{discount:Math.floor((1-candidate/price)*1000+1e-8)/10,price:candidate,requested_discount:d,capped:candidate>roundPrice(price*(1-d/100),cfg)}];
 });
}
function supPrio(sid, cfg){ const s = cfg.suppliers.find(x => x.id === sid); return s ? (+s.priority || 0) : -999; }
function rrpRequired(sid,cfg=S.cfg){ const sp=(cfg.suppliers||[]).find(x=>x.id===sid), v=String((sp&&sp.terms&&sp.terms.rrp)||'').toLowerCase(); return v.includes('да')||v.includes('обязательно')||v==='yes'; }
// Пол цены для комплектов: минимальная цена позиции, при которой чистая маржа остаётся kitMargin.
// Наружу уходит только эта цена — закупки и расходы не раскрываются.
function kitFloor(p, v, cfg = S.cfg){
  const c = calc(p, v, cfg);
  if (c.price == null || c.payout == null) return c.price ?? null;
  const kitM = Math.max(0, +cfg.kitMargin || 0);
  const feePct = Math.max(0, +cfg.taxPct || 0) + Math.max(0, +cfg.acquiringPct || 0);
  const fixed = Math.max(0, +cfg.deliveryCost || 0) + Math.max(0, +cfg.extraCost || 0);
  const denom = 1 - (kitM + feePct) / 100;
  if (denom <= 0) return c.price;
  let floor = roundPriceAtLeast108((c.payout + fixed) / denom, cfg);
  if (c.rrp != null && c.ref && rrpRequired(c.ref.sid, cfg)) floor = Math.max(floor, c.rrp);
  if(pricingProtected(cfg)){
    const protectedFloor=discountedPriceFloor(p,v,cfg);if(protectedFloor==null)return null;
    floor=Math.max(floor,protectedFloor);
    if(floor>c.price)return null;
  }
  return Math.min(c.price, Math.max(floor, 0));
}
// Донат бригаді: відсоток від чека з порогом і стелею в частці прибутку,
// щоб на позиціях з низькою маржою він не з'їдав її повністю.
function donationFor(orderSum, profit, cfg = S.cfg, opts = {}){
  const sum = Math.max(0, +orderSum || 0), prof = Math.max(0, +profit || 0);
  // Оптовые заказы без доната: при скидке −18% на него просто не остаётся прибыли.
  if (opts.wholesale && cfg.donSkipWholesale !== false) return {pct:0, raw:0, donation:0, capped:false, left:Math.round(prof), skipped:"wholesale"};
  const from = +cfg.donFrom || 0, base = +cfg.donPct || 0, big = +cfg.donPctBig || 0;
  let raw;
  if (cfg.donProgressive !== false && from > 0){
    // 3% до порога + 6% на сумму сверх — без обрыва, когда чек чуть перевалил за 10 000
    const lower = Math.min(sum, from) * base / 100;
    const upper = Math.max(0, sum - from) * big / 100;
    raw = cfg.donMode === "profit" ? prof * (sum >= from ? big : base) / 100 : lower + upper;
  } else {
    const pct = sum >= from ? big : base;
    raw = cfg.donMode === "profit" ? prof * pct / 100 : sum * pct / 100;
  }
  const pct = sum > 0 ? Math.round(raw / sum * 1000) / 10 : base;
  const cap = (+cfg.donCapPct || 0) > 0 ? prof * (+cfg.donCapPct) / 100 : Infinity;
  const donation = Math.min(raw, cap);
  return {pct, effPct:pct, raw:Math.round(raw), donation:Math.round(donation), capped:donation < raw - 0.5, left:Math.round(prof - donation)};
}
function marginAfterDonation(p, v, cfg = S.cfg){
  const c = calc(p, v, cfg);
  if (c.price == null || c.netProfit == null) return null;
  const d = donationFor(c.price, c.netProfit, cfg);
  return {donation:d.donation, pct:d.pct, capped:d.capped, left:d.left, leftPct:c.price ? d.left / c.price * 100 : null};
}
function kitDiscountPct(p, v, cfg = S.cfg){
  const c = calc(p, v, cfg), f = kitFloor(p, v, cfg);
  if (c.price == null || f == null || c.price <= 0) return 0;
  return Math.max(0, Math.round((1 - f / c.price) * 1000) / 10);
}
function calc(p, v, cfg = S.cfg){
  const offers = Object.entries(v.offers || {}).filter(([sid]) => cfg.suppliers.some(s => s.id === sid && !s.disabled)).map(([sid, o]) => ({sid, ...o,stock_stale:offerStale(o,cfg)}));
  let o = null;
  if (v.pin){ const x = offers.find(z => z.sid === v.pin); if (x && x.cost>0 && zLive(x)) o = x; }
  if (!o){ const live = offers.filter(z => zLive(z) && z.cost > 0).sort((a,b)=>(+a.payout>0?+a.payout:+a.cost)-(+b.payout>0?+b.payout:+b.cost)||supPrio(b.sid,cfg)-supPrio(a.sid,cfg)); o=live[0]||null; }
  const withCost=offers.filter(z=>z.cost>0&&!z.missing&&!z.priceAlert&&!z.discontinued),byPayout=(a,b)=>(+a.payout>0?+a.payout:+a.cost)-(+b.payout>0?+b.payout:+b.cost)||supPrio(b.sid,cfg)-supPrio(a.sid,cfg);
  const preorderOffers=withCost.filter(z=>{const terms=cfg.suppliers.find(s=>s.id===z.sid)?.terms||{},manufacturing=terms.preorderConfirmed===true&&terms.preorderDefault==='yes'||z.preorderManual&&z.preorder===true&&Number.isInteger(+z.productionDays)&&+z.productionDays>0&&+z.productionDays<=90;return (!z.stock_stale&&(offerAvail(z)==='order'||z.preorder))||manufacturing&&z.preorder!==false;});
  const ref=o||preorderOffers.sort(byPayout)[0]||withCost.sort(byPayout)[0]||null;
  const cost=ref?+ref.cost:null, payout=ref?(+ref.payout>0?+ref.payout:+ref.cost):null, rrp=ref&&+ref.rrp>0?+ref.rrp:null;
  const bigFrom=+cfg.bigPriceFrom||0, bigMargin=Math.max(0,+cfg.bigPriceMargin||0);
  // The supplier payout determines the threshold; RRP may raise the final price.
  const isBig=bigFrom>0 && payout!=null && payout>=bigFrom;
  const minMargin=isBig?bigMargin:Math.max(0,+cfg.minMargin||30), feePct=Math.max(0,+cfg.taxPct||0)+Math.max(0,+cfg.acquiringPct||0), fixed=Math.max(0,+cfg.deliveryCost||0)+Math.max(0,+cfg.extraCost||0);
  const denom=1-(minMargin+feePct)/100; let minPrice=payout!=null&&denom>0?roundPriceAtLeast108((payout+fixed)/denom,cfg):null;
  if(ref&&rrpRequired(ref.sid,cfg)&&rrp!=null) minPrice=Math.max(minPrice||0,rrp);
  let price=null, manual=false;
  if(+v.price>0){ price=+v.price; manual=true; }
  else if(payout!=null){ const markupPct=isBig?bigMargin:ruleMarkup(p,ref.sid,cfg); const byRule=roundPrice(payout*(1+markupPct/100),cfg); const base=rrp!=null?rrp:byRule; price=roundPriceAtLeast108(Math.max(base||0,minPrice||0),cfg); }
  const grossShare=price!=null&&payout!=null?price-payout:null; const grossMargin=price&&payout!=null?grossShare/price*100:null;
  const fees=price!=null?price*feePct/100+fixed:null; const netProfit=price!=null&&payout!=null?price-payout-fees:null; const netMargin=price&&netProfit!=null?netProfit/price*100:null;
  const avail=o?"in":(preorderOffers.length?"order":"out");
  const totalStock=o?offerConfirmedStock(o):null; const lowMargin=netMargin!=null&&netMargin<minMargin-0.001&&!v.marginOverride;
  const rrpViolation=!!(ref&&rrpRequired(ref.sid,cfg)&&rrp!=null&&price!=null&&price<rrp&&!v.marginOverride);
  return {o,ref,cost,payout,rrp,price,minPrice,share:grossShare,grossMargin,fees,netProfit,margin:netMargin,manual,avail,lowMargin,rrpViolation,totalStock,offers,isBig,minMarginUsed:minMargin};
}

function offerConfirmedStock(o){if(!o)return null;const raw=o.stock;if(typeof raw==='number'&&Number.isFinite(raw)&&raw>=0)return raw;return null;}
function confirmedPreorderDays(o){
 if(!o||o.discontinued)return null;if(o.preorderManual&&o.preorder&&Number.isInteger(+o.productionDays)&&+o.productionDays>0&&+o.productionDays<=90)return +o.productionDays;const terms=S.cfg.suppliers.find(s=>s.id===o.sid)?.terms||{},explicit=offerAvail(o)==='order'&&o.leadDays!=null,policy=terms.preorderConfirmed===true&&terms.preorderDefault==='yes';
 if(!explicit&&!policy)return null;return RubizhKits.preorderDays({lead_time:explicit?o.leadDays:terms.preorderDays});
}
function offerStale(o,cfg=S.cfg){const hours=Number(cfg.freshHours);return hours>0&&(!Number.isFinite(Number(o.at))||Number(o.at)<=0||Date.now()-Number(o.at)>hours*3600000);}
function zLive(z){ return !z.stock_stale&&!z.priceAlert&&offerAvail(z)==="in"; }
const _perProd = new Map(); let _perProdVer = -1;
function memoProd(tag, fn){
  return function(p){
    if (_perProdVer !== _dataVer+'|'+Math.floor(Date.now()/60000)){ _perProd.clear(); _perProdVer = _dataVer+'|'+Math.floor(Date.now()/60000); }
    const k = tag + "|" + p.id;
    let v = _perProd.get(k);
    if (v === undefined){ v = fn(p); _perProd.set(k, v); }
    return v;
  };
}
const _summaryMemo = memoProd("sum", p => summaryRaw(p, S.cfg));
function summary(p, cfg = S.cfg){ return cfg === S.cfg ? _summaryMemo(p) : summaryRaw(p, cfg); }
function summaryRaw(p, cfg = S.cfg){
  let minP = Infinity, maxP = -Infinity, minC = Infinity, minR = Infinity, minShare = Infinity, minM = Infinity, stock = 0, low = false, anyIn = false, anyOrder = false;
  const sups = new Set(),stockPools=new Map();
  for (const v of p.variants){
    const c = calc(p, v, cfg);
    if (c.price != null){ minP = Math.min(minP, c.price); maxP = Math.max(maxP, c.price); }
    if (c.cost != null) minC = Math.min(minC, c.cost);
    if (c.rrp != null) minR = Math.min(minR, c.rrp);
    if (c.share != null) minShare = Math.min(minShare, c.share);
    if (c.margin != null) minM = Math.min(minM, c.margin);
    if (c.lowMargin) low = true;
    if(c.totalStock!=null){
      const pool=c.o?.sharedSku?JSON.stringify([c.o.sid,c.o.s,c.o.native_size||'',c.o.native_color||'']):v.sku;
      stockPools.set(pool,Math.max(stockPools.get(pool)||0,c.totalStock));
    }
    if (c.avail === "in") anyIn = true; else if (c.avail === "order") anyOrder = true;
    c.offers.forEach(z => sups.add(z.sid));
  }
  stock=[...stockPools.values()].reduce((n,v)=>n+v,0);
  const marg = isFinite(minM) ? minM : null;
  return {minP:isFinite(minP)?minP:null,maxP:isFinite(maxP)?maxP:null,minC:isFinite(minC)?minC:null,minR:isFinite(minR)?minR:null,minShare:isFinite(minShare)?minShare:null,stock,low,marg,sups:[...sups],
    status: p.archived ? "out" : anyIn ? "in" : anyOrder ? "order" : "out"};
}
const STATUS = {in:"В наличии", order:"Предзаказ · 1–3 дня", out:"Нет в наличии"};
