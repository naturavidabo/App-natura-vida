// Prueba sintetica de cuentas historicas: sin datos reales de clientes.
const Core=require('../js/v8-financial-core.js');
const client={id:'cliente-prueba',name:'Cliente ficticio'};
const fixture=[
 {clientName:'Cliente ficticio',originalDate:'2026-01-10',originalSaleNumber:'TEST-001',products:'Articulo demo',total:100,amountPaid:40,balance:60,observations:'Prueba'},
 {clientName:'Cliente ficticio',originalDate:'2026-02-10',originalSaleNumber:'TEST-002',products:'Articulo demo',total:200,amountPaid:0,balance:200,observations:'Prueba'},
 {clientName:'Cliente ficticio',originalDate:'2026-03-10',originalSaleNumber:'TEST-003',products:'Articulo demo',total:150,amountPaid:0,balance:150,observations:'Prueba'}
];
const rows=fixture.map(r=>Core.normalizeHistoricalRow(r,{clientId:client.id,clientName:client.name}));
const account=Core.aggregateClient(client,rows,[],[]);
function assert(ok,msg){if(!ok)throw new Error(msg)}
assert(rows.length===3,'Deben existir 3 operaciones ficticias');
assert(account.pendingCount===3,'Deben existir 3 deudas activas');
assert(Math.abs(account.totalBought-450)<0.001,'Total comprado incorrecto');
assert(Math.abs(account.totalPaid-40)<0.001,'Total pagado incorrecto');
assert(Math.abs(account.totalDebt-410)<0.001,'Saldo incorrecto');
assert(rows.every(r=>r.inventoryImpact===false),'Las historicas no deben afectar inventario');
assert(rows.every(r=>r.origin==='Importado desde Mi Negocio'),'Origen incorrecto');
const allocation=Core.allocatePayment(rows,[],100,'oldest',[]);
assert(allocation.allocations.length===2,'Pago de 100 debe distribuirse entre dos operaciones');
assert(Math.abs(allocation.allocations[0].amount-60)<0.001,'Primera asignacion incorrecta');
assert(Math.abs(allocation.allocations[1].amount-40)<0.001,'Segunda asignacion incorrecta');
const payment={id:'test-p1',amount:100,status:'posted',allocations:allocation.allocations};
const after=Core.aggregateClient(client,rows,[payment],[]);
assert(Math.abs(after.totalDebt-310)<0.001,'El pago parcial no redujo el saldo');
const restored=Core.aggregateClient(client,rows,[{...payment,status:'voided'}],[]);
assert(Math.abs(restored.totalDebt-410)<0.001,'La anulacion no restauro el saldo');
console.log('OK: cuentas historicas sinteticas, distribucion de pago, anulacion e inventario sin cambios.');
