// Natura Vida 10.1.7 — la sincronización parcial nunca debe aparecer como éxito.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/supabase-sync.js'),'utf8');
const from=source.indexOf("async function runBackgroundSyncOnce(reason = 'automatic') {");
const to=source.indexOf("\nasync function refreshAfterEvent(",from);
assert(from>0&&to>from,'Debe existir la rutina de sincronización principal');
const core=source.slice(from,to);
function makeScenario(overrides={}){
  const states=[],events=[];
  let productsCalls=0;
  const navigator={onLine:true};
  const AppState={session:{pendingApproval:false}};
  const window={
    dispatchEvent:event=>events.push(event.type),
    syncInboxFromCloud:async()=>({ok:true}),
    syncV7Context:async()=>({ok:true}),
    syncV8ContextV800:async()=>({ok:true}),
    refreshInboxBadge:null
  };
  const defaults={
    navigator,AppState,window,
    requireAuth:()=>true,
    setCloudConnectionState:(state,detail)=>states.push({state,detail}),
    syncCloudProductsToLocal:async()=>{productsCalls++;return {ok:true,count:2};},
    syncCloudClientsToLocal:async()=>({ok:true,count:1}),
    syncCloudSalesToLocal:async()=>({ok:true,count:1}),
    syncGenericCloudStoreToLocalV9:async()=>true,
    syncV7Context:()=>window.syncV7Context(),
    syncV8ContextV800:()=>window.syncV8ContextV800(),
    syncInboxFromCloud:()=>window.syncInboxFromCloud(),
    loadAllState:async()=>true,
    renderAfterCloudRefresh:()=>{},
    setTimeout:()=>1,
    messageFromError:err=>String(err?.message||err),
    CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts.detail;}}
  };
  const injected={...defaults,...overrides};
  const names=Object.keys(injected);
  const setup=new Function(...names,"let _refreshInFlight=null;\n"+core+"\nreturn {runBackgroundSyncOnce};");
  const run=setup(...Object.values(injected)).runBackgroundSyncOnce;
  return {run,states,events,productsCalls:()=>productsCalls,navigator};
}
(async()=>{
  let c=makeScenario();
  const normalResult=await c.run('normal');
  assert.equal(normalResult.ok,true,normalResult.message);
  assert(c.events.includes('nv:data-synced'),'Solo el éxito confirma datos');
  assert.equal(c.states.at(-1).state,'online');

  c=makeScenario({syncCloudSalesToLocal:async()=>({ok:false,message:'falló ventas'})});
  assert.equal((await c.run('sales-fail')).ok,false);
  assert.equal(c.states.at(-1).state,'error');
  assert(!c.events.includes('nv:data-synced'));
  assert(c.states.at(-1).detail.includes('ventas'));

  c=makeScenario({syncGenericCloudStoreToLocalV9:async(name)=>name==='settings'?false:true});
  assert.equal((await c.run('settings-fail')).ok,false);
  assert.equal(c.states.at(-1).state,'error');
  assert(!c.events.includes('nv:data-synced'));

  c=makeScenario({syncCloudProductsToLocal:async()=>{throw new Error('problema productos');}});
  assert.equal((await c.run('product-exception')).ok,false);
  assert.equal(c.states.at(-1).state,'error');
  assert(!c.events.includes('nv:data-synced'));

  c=makeScenario({loadAllState:async()=>{throw new Error('render cache failed');}});
  assert.equal((await c.run('loadAllState-fail')).ok,false);
  assert.equal(c.states.at(-1).state,'error');
  assert(!c.events.includes('nv:data-synced'));

  let resolveProducts;
  const pending=new Promise(r=>{resolveProducts=r});
  c=makeScenario({syncCloudProductsToLocal:()=>pending});
  const first=c.run('first'),second=c.run('second');
  resolveProducts({ok:true,count:1});
  assert.equal((await first).ok,true);
  assert.equal((await second).ok,true);
  assert.equal(c.events.filter(x=>x==='nv:data-synced').length,1,'Concurrent requests should coalesce');

  c=makeScenario();
  c.navigator.onLine=false;
  assert.equal((await c.run('offline')).ok,false);
  assert.equal(c.events.length,0);
  console.log('OK V10.1.7: 7 casos (normal, 3 fallos parciales, error de render, concurrencia y sin internet).');
})().catch(err=>{console.error(err);process.exitCode=1});
