const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8');}
function assert(cond,msg){if(!cond){console.error('FAIL',msg);process.exitCode=1;}else console.log('OK',msg);}
const shell=read('js/v7-shell.js');
const center=read('js/v7-management-center.js');
const sales=read('js/sales.js');
const rep=read('js/v7-inventory-sales.js');
const css=read('css/v10.css');
const lazy=read('js/lazy-assets.js');

const routeTabs=[...center.matchAll(/\btab:\s*'([^']+)'/g)].map(m=>m[1]);
for(const tab of [...new Set(routeTabs)]){
  assert(shell.includes(`case '${tab}'`),`render para ${tab}`);
}
assert(center.includes("ensureCatalogPdfModuleV9"),'catálogo usa carga diferida');
assert(center.includes("canReadTeamOrders ? 'pedidos' : 'compra'"),'pedidos respeta lectura de equipo');
assert(shell.includes("hasPermission('routes:manage')"),'distribución permite routes:manage');
assert(shell.includes("hasPermission('territory:team_read')"),'territorio permite lectura de equipo');
assert(shell.includes("tab === 'rendicion-caja'") && shell.includes("commercialRole === 'field_seller'"),'rendición accesible para vendedor vinculado');
assert(lazy.includes("ensureSellerSettlementModuleV9"),'rendición tiene cargador diferido');
assert(lazy.includes("ensureTerritoryModuleV9"),'territorio tiene cargador diferido');
assert(sales.includes('openSalePriceEditorV7') && sales.includes('Precio manual aplicado.'),'precio manual administrador intacto');
assert(rep.includes('saleManualPrices') && rep.includes('Precio manual aplicado.'),'precio manual representante intacto');
assert(css.includes('.nv101ActionList') && css.includes('.v770CenterHead.category.lime'),'V10.1 estiliza acciones y territorio');
assert(css.includes('.v770CategoryCard.v802CategoryCard.lime .v802CategoryCopy small'),'contraste de territorio corregido');
if(process.exitCode) process.exit(process.exitCode);
console.log('Auditoría funcional V10.1 OK');
