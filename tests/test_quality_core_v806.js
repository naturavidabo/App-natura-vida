const fs = require('fs');
const vm = require('vm');
const local = new Map();
const context = {
  console,
  window: {},
  AppState: { products:[], clients:[], sales:[], settings:{}, session:{} },
  localStorage: { getItem:k=>local.has(k)?local.get(k):null, setItem:(k,v)=>local.set(k,String(v)), removeItem:k=>local.delete(k) },
  navigator: { onLine:true },
  document: {},
  Blob: function(){}, URL: {}, TextEncoder,
  setTimeout, clearTimeout,
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/v8-quality-assurance.js','utf8'), context);
const qa=context.NV806QualityAssurance;
if (!qa) throw new Error('No se expuso NV806QualityAssurance.');

(async () => {
  const clients=[
    {id:'c1',name:'Gloria Natural',phone:'70000000',latitude:0,longitude:0},
    {id:'c2',name:'Gloria Natural',phone:'70000000'}
  ];
  const products=[
    {id:'p1',name:'Aceite 500',sku:'A500',stock:5,cost:100,publicPrice:90},
    {id:'p2',name:'Aceite 200',sku:'A500',stock:-1,cost:20,publicPrice:40}
  ];
  const sales=[
    {id:'s1',clientName:'Gloria',sellerId:'u1',total:100,date:1000,items:[{productId:'p1',qty:1}]},
    {id:'s2',clientName:'Gloria',sellerId:'u1',total:100,date:2000,items:[{productId:'missing',qty:0}]}
  ];
  const movements=[
    {id:'m1',productId:'p1',quantity:1,stockBefore:4,stockAfter:5,createdAt:1000},
    {id:'m2',productId:'p1',quantity:1,stockBefore:7,stockAfter:8,createdAt:2000}
  ];
  const ci=qa.inspectClients(clients).map(x=>x.code);
  const pi=qa.inspectProducts(products).map(x=>x.code);
  const si=qa.inspectSales(sales,products).map(x=>x.code);
  const ii=qa.inspectInventory(movements,products).map(x=>x.code);
  if (!ci.includes('client_duplicate_phone') || !ci.includes('client_invalid_location')) throw new Error('Falló control de clientes.');
  if (!pi.includes('product_duplicate_sku') || !pi.includes('product_price_below_cost') || !pi.includes('product_negative_stock')) throw new Error('Falló control de productos.');
  if (!si.includes('sale_probable_duplicate') || !si.includes('sale_invalid_quantity') || !si.includes('sale_orphan_product')) throw new Error('Falló control de ventas.');
  if (!ii.includes('movement_sequence_gap') || !ii.includes('inventory_current_mismatch')) throw new Error('Falló conciliación de inventario.');

  const data={clients:[{id:'c1',name:'Gloria'}],products:[{id:'p1',name:'Aceite'}]};
  const hash=await qa.sha256(qa.stableStringify(data));
  const valid=await qa.validateBackupObject({schema:'natura-vida-verified-backup',version:'8.0.7',data,integrity:{payloadHash:hash}});
  if (!valid.ok) throw new Error('Un respaldo íntegro fue rechazado.');
  const tampered=await qa.validateBackupObject({schema:'natura-vida-verified-backup',version:'8.0.7',data:{...data,clients:[{id:'c1',name:'Otro'}]},integrity:{payloadHash:hash}});
  if (tampered.ok || !tampered.errors.some(x=>x.includes('huella digital'))) throw new Error('No detectó alteración del respaldo.');
  console.log('Núcleo de calidad V8.0.7: 5/5 grupos de prueba OK');
})().catch(error => { console.error(error); process.exit(1); });
