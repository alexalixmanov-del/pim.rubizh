// Isolated execution of the uploaded application. Startup and real networking are disabled.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {createRequire} = require('node:module');
const appRequire = createRequire(path.join(__dirname, '../package.json'));
const {parseHTML} = appRequire('linkedom');
const {IDBFactory, IDBKeyRange} = appRequire('fake-indexeddb');

function createHarness({runtime=false}={}) {
  const {document} = parseHTML('<html><head></head><body><div id="nav"></div><div id="main"><div id="view"></div></div><div id="drawer" hidden></div><div id="toast"></div><div id="saveState"></div><div id="sbStatus"></div><input id="gs"><div id="gsres"></div></body></html>');
  const local = new Map(), listeners = new Map(), alerts = [], warnings = [], downloads = [];
  document.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  const localStorage = {
    getItem: k => local.get(k) ?? null,
    setItem(k,v) { local.set(k, String(v)); Object.defineProperty(this,k,{value:String(v),enumerable:true,configurable:true}); },
    removeItem(k) { local.delete(k); delete this[k]; },
    key: i => [...local.keys()][i] ?? null,
    get length() { return local.size; }
  };
  const ctx = {
    console: {log(){},warn(...args){warnings.push(args.map(String).join(' '));},error(...args){warnings.push(args.map(String).join(' '));}},
    performance,Blob,Response,Request,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,
    CompressionStream,DecompressionStream,AbortController,structuredClone,crypto:require('node:crypto').webcrypto,
    document,localStorage,indexedDB:new IDBFactory(),IDBKeyRange,
    navigator:{},location:{search:'',href:'http://audit.invalid/',protocol:'http:',reload(){}},
    setTimeout(fn,ms){return runtime&&ms===0?setTimeout(fn,0):undefined;},clearTimeout(id){if(id)clearTimeout(id);},setInterval(){},clearInterval(){},
    alert: s => alerts.push(String(s)),confirm:()=>true,prompt:()=>null,
    fetch:async()=>{throw Error('Real network disabled in audit');},
    btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
    addEventListener(){},scrollTo(){},CSS:{escape:s=>String(s)}
  };
  ctx.window=ctx;
  vm.createContext(ctx);
  const html=fs.readFileSync(path.join(__dirname,'../rubizh_pim.html'),'utf8');
  new vm.Script(fs.readFileSync(path.join(__dirname,'../lib/kits.js'),'utf8')).runInContext(ctx);
  new vm.Script(fs.readFileSync(path.join(__dirname,'../lib/categories.js'),'utf8')).runInContext(ctx);
  new vm.Script(fs.readFileSync(path.join(__dirname,'../lib/product-model.js'),'utf8')).runInContext(ctx);
  for(const name of ['category-evidence','size-evidence','inventory-policy'])new vm.Script(fs.readFileSync(path.join(__dirname,'../lib/'+name+'.js'),'utf8')).runInContext(ctx);
  const js=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1].split('/* ===================== старт ===================== */')[0];
  new vm.Script(js,{filename:'uploaded-pim.js'}).runInContext(ctx);
  const run=s=>vm.runInContext(s,ctx);
  // Legacy suites exercise the pre-integration path; runtime suites use the shipped review boundary.
  if(!runtime)run(`runImport=classificationImport;doImport=classificationPreview;applyImport=classificationApplyImport;classificationReviewMode=()=>false;sitePublish=classificationSitePublish;simpleApplyPolicy=classificationSimplePolicy;sbCfg=classificationSB;window.fetch=classificationNetwork;`);
  run(`S.cfg=structuredClone(DEFAULT_CFG);S.cfg.autoTranslateNames=true;S.cfg.siteUrl='https://rubizh.shop';
    S.cfg.suppliers=[{id:'supplier-a',name:'Тестовий постачальник',auto:false,priority:0,inventory_policy:{id:'test-quantity-v1',mode:'QUANTITY',confirmed:true,source_column:'Stock'},terms:{priceType:'cost',preorderDefault:'no',preorderConfirmed:true}}];
    S.products=new Map();S.queue=new Map();S.content=new Map();S.logs=[];S.docs=new Map();rebuildIndex();bumpData();`);
  ctx.downloadCapture=(name,blob)=>{downloads.push({name,blob});return true;};
  run('offerDownload=async(name,blob)=>downloadCapture(name,blob);');
  function product(overrides={}) {
    return Object.assign({id:'p-a',name:'Рюкзак Test Pack',category:'Рюкзаки, сумки та баули / Рюкзаки / Тактичні рюкзаки',brand:'TEST',desc:'<p>Матеріал: Нейлон</p><p>Об’єм: 30 л</p>',attrs:{Матеріал:'Нейлон','Об’єм':'30 л'},photos:['https://rubizh.shop/media/test.webp'],pub:true,ads:false,archived:false,catSource:'manual',fieldMeta:{},variants:[{sku:'RUB-00001',size:'',color:'Олива',price:0,offers:{'supplier-a':{s:'feed-a',cost:1000,payout:1000,stock:5,availability:'in',at:Date.now(),photos:['https://rubizh.shop/media/test.webp']}}}]},overrides);
  }
  function add(p) {ctx.inputProduct=p;run('ensureFieldMeta(inputProduct);S.products.set(inputProduct.id,inputProduct);rebuildIndex();');return p;}
  async function click(action,dataset={}) {
    const b=document.createElement('button');b.dataset.act=action;
    for(const [k,v] of Object.entries(dataset))b.dataset[k]=String(v);
    document.body.appendChild(b);
    const event={target:b,preventDefault(){},stopPropagation(){}};
    const results=await Promise.allSettled((listeners.get('click')||[]).map(fn=>Promise.resolve().then(()=>fn(event))));
    b.remove();return results.filter(r=>r.status==='rejected').map(r=>r.reason.message);
  }
  return {ctx,run,document,local,listeners,alerts,warnings,downloads,product,add,click};
}
module.exports={createHarness,appRequire};
