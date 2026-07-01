'use strict';
const { createDevice, createFakeBackend } = require('./harness');

function ok(label, cond, extra) {
  console.log((cond ? '✅ PASA' : '❌ FALLA') + ' — ' + label + (extra ? ' | ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

async function activateAdmin(backend, username, password) {
  const dev = createDevice(backend);
  await dev.ensureBootstrapData();
  await dev.authenticateUser('admin', '12345678');
  await dev.updateLocalPassword(dev.AppState.session.userId, password, { username, activationCode: '27121961' });
  return dev;
}

async function activateReseller(backend, username, password) {
  const dev = createDevice(backend);
  await dev.ensureBootstrapData();
  await dev.authenticateUser('vendedor1', '23456');
  await dev.updateLocalPassword(dev.AppState.session.userId, password, { username });
  return dev;
}

async function main() {
  const backend = createFakeBackend();
  const admin1 = await activateAdmin(backend, '70011111', 'claveAdmin1');

  // ---------------------------------------------------------------
  // 2/4. PRODUCTOS: admin1 crea un producto, lo publica; admin2 (otro
  // celular) lo descarga al presionar "Actualizar" (runFullAdminSync).
  // ---------------------------------------------------------------
  const product = {
    id: 'prod_test_001', name: 'Crema de prueba', category: 'Cuidado facial',
    price_public: 50, price_reseller: 35, price_distributor: 30, active: true,
    stock: 20, status: 'active', createdAt: Date.now(), updatedAt: Date.now()
  };
  await admin1.DB.put('products', product);
  await new Promise(r => setTimeout(r, 20));
  ok('2/3. El producto creado por admin1 llega a la tabla products de Supabase', backend.tables.products.has('prod_test_001'));

  const admin2 = createDevice(backend);
  const admin2login = await admin2.authenticateUser('70011111', 'claveAdmin1');
  ok('1c. admin2 (mismo usuario, otro celular) inicia sesión online', admin2login.ok && admin2login.online === true);

  const adminSync = await admin2.runFullAdminSync();
  const downloaded = (await admin2.DB.getAll('products')).find(p => p.id === 'prod_test_001');
  ok('2/4. Al presionar "Actualizar" en el segundo celular, el producto aparece descargado', !!downloaded, JSON.stringify(adminSync.pulled));

  // ---------------------------------------------------------------
  // 3/4. PEDIDOS (purchase_orders): un representante crea un pedido; el
  // administrador lo ve al abrir/refrescar su bandeja de pedidos
  // (renderAdminOrdersInbox / fetchCloudPurchaseOrders) — NO al presionar
  // el botón general "Actualizar" del panel principal.
  // ---------------------------------------------------------------
  const rep1 = await activateReseller(backend, '70022222', 'claveRep1');
  const order = { id: 'order_test_1', representativeId: rep1.AppState.session.userId, representativeName: 'Rep Uno', items: [{ productId: 'prod_test_001', qty: 5 }], status: 'pendiente', createdAt: Date.now() };
  await rep1.DB.put('purchaseOrders', order);
  await new Promise(r => setTimeout(r, 20));
  ok('3. El pedido del representante llega a purchase_orders en Supabase', backend.tables.purchase_orders.has('order_test_1'));

  const adminSyncAfterOrder = await admin2.runFullAdminSync();
  const orderInLocalAfterMainSync = (await admin2.DB.getAll('purchaseOrders')).find(o => o.id === 'order_test_1');
  ok('4. El botón general "Actualizar" del admin NO descarga pedidos nuevos (hallazgo, no es error: hay que abrir/refrescar la pantalla de Pedidos)',
    !orderInLocalAfterMainSync, 'presente tras Actualizar general: ' + !!orderInLocalAfterMainSync);

  const cloudOrders = await admin2.fetchCloudPurchaseOrders();
  await admin2.DB.bulkPut('purchaseOrders', cloudOrders.orders || [], { silent: true });
  const orderAfterInboxRefresh = (await admin2.DB.getAll('purchaseOrders')).find(o => o.id === 'order_test_1');
  ok('4. Al refrescar específicamente la pantalla de Pedidos, el pedido SÍ aparece', !!orderAfterInboxRefresh, JSON.stringify(cloudOrders.ok));

  // ---------------------------------------------------------------
  // 2/3. CLIENTES Y COTIZACIONES: confirmar que NO sincronizan (ni hacia
  // arriba ni hacia abajo), y que tampoco generan ningún error en consola
  // al intentarlo (quedan en la cola local sin causar ruido).
  // ---------------------------------------------------------------
  const client = { id: 'client_test_1', name: 'Cliente de prueba', phone: '70000000', createdAt: Date.now() };
  await admin1.DB.put('clients', client);
  await new Promise(r => setTimeout(r, 20));
  ok('2/3. Un cliente nuevo NO llega a ninguna tabla de Supabase (no existe tabla "clients" remota en este proyecto)',
    !backend.tables.clients, 'tablas existentes en el backend: ' + Object.keys(backend.tables).join(','));
  await admin1.flushPendingSyncQueue(); // nadie llama esto automáticamente para "clients"; se fuerza para la prueba
  const clientQueueItem = (await admin1.DB.getAll('syncQueue')).find(q => q.storeName === 'clients' && q.recordId === 'client_test_1');
  ok('2/3. El cliente queda procesado sin error en la cola (no se traba ni genera ruido), aunque nunca llegue a Supabase',
    clientQueueItem && clientQueueItem.status === 'done', JSON.stringify(clientQueueItem));

  console.log('\n--- Resumen final de tablas en el backend simulado ---');
  for (const [name, map] of Object.entries(backend.tables)) console.log(`  ${name}: ${map.size} fila(s)`);
}

main().catch(e => { console.error('ERROR INESPERADO EN LA PRUEBA:', e); process.exitCode = 1; });
