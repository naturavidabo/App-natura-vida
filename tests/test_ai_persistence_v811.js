const fs=require('fs');
const vm=require('vm');
const path=require('path');
const storage=new Map();
const now=Date.now();
const sandbox={
  console,
  setTimeout:()=>0,
  clearTimeout:()=>{},
  requestAnimationFrame:(fn)=>fn(),
  navigator:{onLine:true},
  localStorage:{
    getItem:k=>storage.has(k)?storage.get(k):null,
    setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k)
  },
  document:{
    readyState:'loading',addEventListener:()=>{},querySelector:()=>null,getElementById:()=>null,
    createElement:()=>({innerHTML:'',textContent:'',innerText:''}),documentElement:{scrollHeight:0}
  },
  MutationObserver:function(){this.observe=()=>{}},
  window:{
    innerHeight:800,scrollY:0,
    AppState:{
      currentTab:'inicio',
      session:{userId:'admin-1',fullName:'Cristhian Espinoza'},
      sales:[{id:'s1',date:now,total:130,items:[{productId:'p500',qty:1,unitPrice:115,unitCost:47.25}]}],
      products:[
        {id:'p100',name:'Aceite de Coco (100 ml / Frasco PET)',stock:38,cost:20,price:35,status:'active'},
        {id:'p200',name:'Aceite de coco 200ml',stock:19,cost:30,price:60,status:'active'},
        {id:'p500',name:'Aceite de Coco (500 ml / Frasco PET)',stock:11,cost:47.25,price:115,status:'active'}
      ],
      clients:[{id:'c-alexia',name:'DRA ALEXIA BIOMUJER',businessName:'Alexia Bio mujer',customerType:'wholesale'}],
      settings:{minMargin:25,maxDiscount:10}
    },
    requireAuth:()=>true,
    isAdmin:()=>true,
    fmtMoney:n=>`Bs ${Number(n).toFixed(2)}`,
    escapeHtml:s=>String(s),
    unitPrice:p=>Number(p.price||0),
    grossCost:p=>Number(p.cost||0)
  }
};
sandbox.window.window=sandbox.window;
sandbox.window.document=sandbox.document;
sandbox.window.navigator=sandbox.navigator;
sandbox.window.localStorage=sandbox.localStorage;
sandbox.window.setTimeout=sandbox.setTimeout;
sandbox.window.clearTimeout=sandbox.clearTimeout;
sandbox.window.requestAnimationFrame=sandbox.requestAnimationFrame;
sandbox.window.MutationObserver=sandbox.MutationObserver;
Object.assign(sandbox,sandbox.window);
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/v8-ai-assistant.js'),'utf8'),sandbox);
const api=sandbox.window.__nvAiV829;
if(!api) throw new Error('API interna V8.2.9 no disponible');

api.clearConversation();
api.addEntry({role:'user',text:'¿Cómo van las ventas hoy?',at:1});
api.addEntry({role:'assistant',response:api.answerLocal('ventas hoy'),at:2});
const rows=api.readConversation();
if(rows.length!==2) throw new Error(`Se esperaban 2 entradas, se obtuvieron ${rows.length}`);
if(rows[0].role!=='user'||rows[1].role!=='assistant') throw new Error('Orden o roles incorrectos');
if(!String(rows[1].response.title).toLowerCase().includes('ventas')) throw new Error('Respuesta estructurada no persistió');

const question='Hazme un recibo por tres aceites de 200 ml, uno de 100 ml y dos de 500 ml para la cliente Alexia Bio mujer';
const engineResponse={
  title:'Preparación de venta',body:'Borrador preparado.',missingFields:['payment_method','sale_type'],
  draftAction:{
    type:'prepare_sale',client_query:'Alexia Bio mujer',payment_method:'',sale_type:'',
    items:[
      {product_query:'Aceite de coco 200 ml',quantity:3},
      {product_query:'Aceite de coco 100 ml PET',quantity:1},
      {product_query:'Aceite de coco 500 ml PET',quantity:2}
    ]
  }
};
const draft=api.resolveDraftActionV829(question,engineResponse);
if(draft.type!=='prepare_sale') throw new Error(`Tipo operativo incorrecto: ${draft.type}`);
if(draft.clientId!=='c-alexia') throw new Error(`Cliente no resuelto: ${draft.clientId}`);
if(draft.missingFields.length) throw new Error(`Campos no bloqueantes siguieron bloqueando: ${draft.missingFields.join(',')}`);
const quantities=Object.fromEntries(draft.items.map(x=>[String(x.productName).match(/(100|200|500)/)?.[1],Number(x.quantity)]));
if(quantities['200']!==3||quantities['100']!==1||quantities['500']!==2) throw new Error(`Cantidades incorrectas: ${JSON.stringify(quantities)}`);
const proposals=api.buildActionProposals(question,{...engineResponse,draftAction:draft});
if(!proposals.some(x=>x.type==='prepare_sale')) throw new Error('No se generó el trabajo de venta preparado');
console.log('OK V8.2.9: persistencia y venta multítem operativa verificadas');
