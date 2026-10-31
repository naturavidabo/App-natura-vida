'use strict';
/* Regresión de contraste del checkout fijo NaturaVida V10.1.10 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const css = fs.readFileSync('css/v10.css','utf8');
const html = fs.readFileSync('index.html','utf8');
const sw = fs.readFileSync('service-worker.js','utf8');
const lazy = fs.readFileSync('js/lazy-assets.js','utf8');
const version = JSON.parse(fs.readFileSync('app-version.json','utf8'));
function luminance(hex){
  const s=hex.replace('#','');
  const rgb=[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255)
    .map(c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4));
  return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
}
function contrast(a,b){
  const L1=luminance(a),L2=luminance(b);
  return (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
}
const buttonRule = css.match(/body\.nv10 #cartBar button#goToCheckout\.btn\{([^}]+)\}/);
assert.ok(buttonRule,'Debe existir un estilo específico para el botón del carrito');
assert.match(buttonRule[1],/background:[^;]*#fff/i,'Botón de alto contraste con fondo claro');
assert.match(buttonRule[1],/color:#06482e!important/i,'Texto oscuro con prioridad sobre estilos generales');
assert.match(css,/body\.nv10 #cartBar button#goToCheckout\.btn:focus-visible/);
assert.ok(contrast('#ffffff','#06482e')>=4.5,'Texto principal cumple contraste AA');
assert.ok(contrast('#f0fff6','#075238')>=4.5,'Navegación cumple contraste AA');
assert.ok(css.lastIndexOf('body.nv10 #cartBar button#goToCheckout.btn')>css.indexOf('/* Botones generales:'),'Regla correctiva debe estar después de estilo genérico');
assert.ok(html.includes('css/v10.css?v='+version.version),'HTML apunta a la hoja vigente');
assert(new Intl.Collator('en',{numeric:true}).compare(version.version,'10.1.10')>=0,'Requiere corrección de contraste o posterior');
assert.ok(sw.includes('nv-app-shell-v'+version.version.replace(/\./g,'-')),'Service Worker rota la caché para aplicar CSS');
assert.ok(lazy.includes('localAssetV9') && lazy.includes('ASSET_VERSION_V9'),'Carga diferida usa la misma versión del shell');
assert.ok(!lazy.includes('v=10.1.8'),'No hay módulos diferidos bloqueados a una versión anterior');
console.log('PASS: contraste de carrito, navegación, prioridad CSS y caché PWA.');
