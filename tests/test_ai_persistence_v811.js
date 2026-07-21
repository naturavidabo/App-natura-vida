const fs=require('fs');
const vm=require('vm');
const storage=new Map();
const sandbox={
  console,
  setTimeout:()=>0,
  clearTimeout:()=>{},
  requestAnimationFrame:(fn)=>fn(),
  localStorage:{
    getItem:k=>storage.has(k)?storage.get(k):null,
    setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k)
  },
  document:{readyState:'loading',addEventListener:()=>{},querySelector:()=>null,getElementById:()=>null},
  MutationObserver:function(){this.observe=()=>{}},
  window:{
    AppState:{
      currentTab:'inicio',
      session:{userId:'admin-1',fullName:'Cristhian Espinoza'},
      sales:[{id:'s1',date:Date.now(),total:130,items:[{productId:'p1',qty:1,unitPrice:130,unitCost:80}]}],
      products:[{id:'p1',name:'Aceite de Coco 500 ml',stock:3,cost:80}],
      clients:[],settings:{}
    },
    requireAuth:()=>true,
    isAdmin:()=>true,
    fmtMoney:n=>`Bs ${Number(n).toFixed(2)}`,
    escapeHtml:s=>String(s)
  }
};
sandbox.window.window=sandbox.window;
sandbox.window.document=sandbox.document;
sandbox.window.localStorage=sandbox.localStorage;
sandbox.window.setTimeout=sandbox.setTimeout;
sandbox.window.clearTimeout=sandbox.clearTimeout;
sandbox.window.requestAnimationFrame=sandbox.requestAnimationFrame;
sandbox.window.MutationObserver=sandbox.MutationObserver;
Object.assign(sandbox,sandbox.window);
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../js/v8-ai-assistant.js'),'utf8'),sandbox);
const api=sandbox.window.__nvAiV812;
if(!api) throw new Error('API interna V8.1.2 no disponible');
api.clearConversation();
api.addEntry({role:'user',text:'¿Cómo van las ventas hoy?',at:1});
api.addEntry({role:'assistant',response:api.answerLocal('ventas hoy'),at:2});
const rows=api.readConversation();
if(rows.length!==2) throw new Error(`Se esperaban 2 entradas, se obtuvieron ${rows.length}`);
if(rows[0].role!=='user'||rows[1].role!=='assistant') throw new Error('Orden o roles incorrectos');
if(!rows[1].response.title.includes('ventas')) throw new Error('Respuesta estructurada no persistió');
const reloaded=api.readConversation();
if(JSON.stringify(rows)!==JSON.stringify(reloaded)) throw new Error('La conversación no sobrevive una nueva lectura');
console.log('OK conversación persistente V8.1.2:',rows.length,'entradas');
