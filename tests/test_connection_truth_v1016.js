// Natura Vida 10.1.7: estado visual no debe simular una conexión o sync exitosa.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/v8-offline-continuity.js'),'utf8');
const syncSrc=fs.readFileSync(path.join(__dirname,'../js/supabase-sync.js'),'utf8');
const listeners=new Map();
const addEventListener=(name,handler)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(handler);};
const emit=(name,detail)=>{for(const fn of listeners.get(name)||[])fn({type:name,detail,target:null});};
let html='';
const classes=new Set();
const badge={
  classList:{add(...items){items.forEach(x=>classes.add(x));},remove(...items){items.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);}},
  setAttribute(){},addEventListener(){},
  querySelector(selector){if(selector==='b'){const m=html.match(/<b>([^<]*)<\/b>/);return m?{textContent:m[1]}:null;}return null;},
  set innerHTML(v){html=v;},get innerHTML(){return html;},
  title:''
};
const document={readyState:'loading',getElementById(id){return id==='cloudStatusBadge'?badge:null;},addEventListener(){},querySelector:()=>null,body:{querySelectorAll:()=>[]}};
const local=new Map();
const storage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
let duplicateNetworkCalls=0;
const navigator={onLine:true};
const AppState={currentTab:'home',session:{isAuthenticated:true,onlineUserId:'tester'}};
const window={
  AppState,CloudConnection:{state:'connecting'},
  addEventListener,
  syncAfterLogin:()=>{duplicateNetworkCalls++;return Promise.resolve({ok:true});},
  startRealtimeSubscriptions:()=>{duplicateNetworkCalls++;return true;},
  requireAuth:()=>true
};
let reconnectCallback=null;
const fn=new Function('window','document','navigator','localStorage','AppState','setTimeout','clearTimeout','setInterval','console',src);
fn(window,document,navigator,storage,AppState,(callback)=>{reconnectCallback=callback;return 1;},()=>{},()=>{},console);
const api=window.NV805OfflineContinuity;
assert(api);
api.init();
assert(html.includes('Conectando'),'No se debe poner en línea solo porque el teléfono tenga internet');
assert.equal(api.getLastSync(),'','Sin cronología confirmada al iniciar');
window.CloudConnection.state='online';emit('nv:connection',{state:'online'});
assert(html.includes('En línea'),'La señal real de conexión debe verse');
assert.equal(api.getLastSync(),'','Una señal Realtime no prueba que se hayan descargado datos');
emit('nv:data-synced',{reason:'inicio'});
assert(api.getLastSync(),'La sincronización real debe registrar fecha');
const synced=api.getLastSync();
window.CloudConnection.state='offline';navigator.onLine=false;emit('offline');
assert(html.includes('Sin internet'));
navigator.onLine=true;window.CloudConnection.state='connecting';emit('online');
assert(html.includes('Reconectando'),'Recuperar wifi no es igual a Supabase conectado');
assert.equal(duplicateNetworkCalls,0,'La UI nunca debe duplicar sincronizaciones que realiza Supabase');
reconnectCallback?.();
assert(!html.includes('En línea'),'No confirmar conexión tras retraso arbitrario');
window.CloudConnection.state='error';emit('nv:connection',{state:'error'});
assert(html.includes('Reconectando'),'Error de Supabase no es online');
assert.equal(api.getLastSync(),synced,'No marcar sincronización si falló');
window.CloudConnection.state='online';emit('nv:connection',{state:'online'});
assert(html.includes('En línea'));
assert.equal(api.getLastSync(),synced,'Realtime no debe actualizar ultima sincronización');
assert(syncSrc.includes("new CustomEvent('nv:data-synced'"),'El núcleo debe emitir la señal de datos validados');
console.log('OK V10.1.7: conectividad real, fallos de red, reconexión sin doble sync y confirmación de datos.');
