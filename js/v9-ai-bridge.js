/* Natura Vida V9 — puente liviano del Asistente IA. */
(() => {
  'use strict';
  let loading=null;
  function adminAllowed(){ try{return !!(window.isAdmin&&isAdmin());}catch(_){return false;} }
  function loadAI(){
    if(window.renderAIAssistantV9)return Promise.resolve(window.__nvAiV9||true);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='js/v8-ai-assistant.js?v=10.1.5';
      s.async=true;
      s.onload=()=>window.renderAIAssistantV9?resolve(window.__nvAiV9||true):reject(new Error('IA no inicializada'));
      s.onerror=()=>reject(new Error('No se pudo cargar IA'));
      document.head.appendChild(s);
    }).catch(error=>{loading=null;throw error;});
    return loading;
  }
  async function openAI(){
    if(!adminAllowed())return;
    try{await loadAI();window.openAIAssistantSheetV9?.();}
    catch(_){window.showToast?.('No se pudo cargar el Asistente IA. Revisa tu conexión.','error');}
  }
  function ensureFab(){
    let fab=document.getElementById('nvAiFab');
    const blocked=!adminAllowed()||String(window.AppState?.currentTab||'')==='asistente-ia'||document.querySelector('.loginShell');
    if(blocked){fab?.remove();return;}
    if(fab)return;
    fab=document.createElement('button');fab.id='nvAiFab';fab.className='nvAiFab';fab.type='button';
    fab.innerHTML='<span class="nvAiFabFace" aria-hidden="true">✦</span><span class="nvAiFabBadge">IA</span>';
    fab.setAttribute('aria-label','Abrir Asistente IA');fab.onclick=openAI;document.body.appendChild(fab);
  }
  window.ensureAIAssistantModuleV9=loadAI;
  window.refreshAIFabBridgeV9=ensureFab;
  window.addEventListener('nv:ai-route-changed',ensureFab);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureFab,250));
  else setTimeout(ensureFab,250);
})();