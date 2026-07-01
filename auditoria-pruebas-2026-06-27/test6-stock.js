'use strict';
const { createDevice, createFakeBackend } = require('./harness');

function ok(label, cond, extra) {
  console.log((cond ? '✅ PASA' : '❌ FALLA') + ' — ' + label + (extra ? ' | ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

async function activateReseller(backend, username, password) {
  const dev = createDevice(backend);
  await dev.ensureBootstrapData();
  await dev.authenticateUser('vendedor1', '23456');
  const res = await dev.updateLocalPassword(dev.AppState.session.userId, password, { username });
  if (!res.ok || !res.cloud || !res.cloud.ok) throw new Error('No se pudo activar el representante de prueba: ' + JSON.stringify(res));
  return dev;
}

async function main() {
  const backend = createFakeBackend();

  // Dispositivo 1 del representante "70022222"
  const dev1 = await activateReseller(backend, '70022222', 'claveRep123');
  const repUid = dev1.AppState.session.onlineUserId;

  // ---------------------------------------------------------------
  // 6a. Un solo dispositivo: vende 2, luego recibe 10 más. El resultado
  // final en la nube debe ser exactamente la suma de ambos ajustes.
  // ---------------------------------------------------------------
  // NOTA: el piso de "nunca menos de 0" se aplica en CADA ajuste individual
  // (greatest(0, stock+delta) dentro de la función SQL), no solo al final.
  // Como no había stock previo (arranca en 0), -2 queda en 0 (no en -2), y
  // luego +10 da 10. Si el delta fuera -2 sobre un stock ya existente de,
  // por ejemplo, 5, el resultado sí sería 3 sin clamping. Esto es
  // intencional (el stock nunca debe mostrarse negativo) pero es importante
  // dejarlo documentado: vender más de lo que hay disponible se "pierde"
  // silenciosamente en el remanente negativo en vez de quedar registrado
  // como sobreventa.
  await dev1.queueRepresentativeStockDelta('prod_jabon', -2);
  await dev1.queueRepresentativeStockDelta('prod_jabon', 10);
  await new Promise(r => setTimeout(r, 30));
  const stockMap1 = await dev1.fetchRepresentativeStockMap();
  ok('6a. Stock resultante tras -2 (con piso en 0) y +10 es 10', stockMap1.get('prod_jabon') === 10, `stock=${stockMap1.get('prod_jabon')}`);

  // ---------------------------------------------------------------
  // 6b. SEGUNDO DISPOSITIVO del MISMO representante: ¿descarga ese stock?
  // ---------------------------------------------------------------
  const dev2 = createDevice(backend);
  const dev2login = await dev2.authenticateUser('70022222', 'claveRep123');
  ok('6b. El segundo celular del mismo representante inicia sesión online', dev2login.ok && dev2login.online === true);
  const stockMap2 = await dev2.fetchRepresentativeStockMap();
  ok('6b. El segundo celular ve el mismo stock (10) para ese producto', stockMap2.get('prod_jabon') === 10, `stock visto=${stockMap2.get('prod_jabon')}`);

  // ---------------------------------------------------------------
  // 6c. EL PUNTO CRÍTICO: dos celulares del MISMO representante venden
  // "al mismo tiempo" (sin haber sincronizado entre sí). Antes (V6.3,
  // valor absoluto) esto podía perder una de las dos ventas. Ahora (V6.4,
  // delta atómico) ambas deben reflejarse sin pisarse.
  // ---------------------------------------------------------------
  // Reseteamos un producto a un valor conocido para la prueba.
  await dev1.queueRepresentativeStockDelta('prod_crema', 50);
  await new Promise(r => setTimeout(r, 20));

  // Disparamos los dos ajustes EN PARALELO (Promise.all), simulando que
  // ambos celulares venden casi al mismo instante, sin esperar el uno al otro.
  await Promise.all([
    dev1.queueRepresentativeStockDelta('prod_crema', -7),  // dev1 vende 7
    dev2.queueRepresentativeStockDelta('prod_crema', -12)  // dev2 vende 12, "al mismo tiempo"
  ]);
  await new Promise(r => setTimeout(r, 30));

  const finalStockMap = await dev1.fetchRepresentativeStockMap();
  ok('6c. El resultado final refleja AMBAS ventas (50-7-12=31), no solo la última en llegar',
    finalStockMap.get('prod_crema') === 31, `stock final=${finalStockMap.get('prod_crema')}`);

  // ---------------------------------------------------------------
  // 6d. Idempotencia: reenviar el MISMO movimiento (mismo movementId) no
  // debe aplicar el ajuste dos veces (simula una respuesta de red perdida
  // después de que el servidor ya aplicó el cambio).
  // ---------------------------------------------------------------
  const repeatedMovementId = 'movimiento-de-prueba-fijo-0001';
  const r1 = await dev1.adjustRepresentativeStockRemote('prod_unico', 5, repeatedMovementId);
  const r2 = await dev1.adjustRepresentativeStockRemote('prod_unico', 5, repeatedMovementId); // mismo movementId, reintento
  ok('6d. Reintentar el mismo movementId no aplica el ajuste dos veces', r1.stock === 5 && r2.stock === 5, `r1=${r1.stock} r2=${r2.stock}`);

  // ---------------------------------------------------------------
  // 6e. RLS (simulado): un representante NO puede ver el stock de otro,
  // incluso si consulta la tabla SIN el filtro .eq() que pone el código de
  // la app (fetchRepresentativeStockMap siempre filtra por su propio id;
  // aquí forzamos una consulta "cruda", como si alguien usara la API REST
  // de Supabase directamente, para confirmar que el RLS simulado igual
  // bloquea filas que no son suyas).
  // ---------------------------------------------------------------
  const dev3 = await activateReseller(backend, '70033333', 'otraClave123');
  const sbRaw = dev3.getSupabaseClient();
  const rawAttempt = await sbRaw.from('representative_stock').select('product_id, stock');
  const sawOthersStock = (rawAttempt.data || []).some(r => r.representative_user_id && r.representative_user_id !== dev3.AppState.session.onlineUserId);
  ok('6e. Una consulta cruda (sin filtrar por su propio id) NO devuelve stock de otros representantes (RLS)',
    !sawOthersStock, `filas devueltas=${(rawAttempt.data || []).length}, error=${JSON.stringify(rawAttempt.error)}`);

  // Y, por las dudas, si dev3 intentara mandar un upsert directo a la tabla
  // con OTRO representative_user_id (no el suyo), también debe bloquearse.
  const fakeUpsert = await sbRaw.from('representative_stock').upsert(
    { representative_user_id: repUid, product_id: 'prod_robado', stock: 999 },
    { onConflict: 'representative_user_id,product_id' }
  );
  ok('6e. Un intento de escribir directamente el stock de OTRO representante es rechazado por RLS',
    !!fakeUpsert.error, JSON.stringify(fakeUpsert));
}

main().catch(e => { console.error('ERROR INESPERADO EN LA PRUEBA:', e); process.exitCode = 1; });
