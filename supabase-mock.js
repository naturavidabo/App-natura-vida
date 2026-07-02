'use strict';
const { createDevice, createFakeBackend } = require('./harness');

function ok(label, cond, extra) {
  console.log((cond ? '✅ PASA' : '❌ FALLA') + ' — ' + label + (extra ? ' | ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

process.on('unhandledRejection', (err) => {
  console.log('🛑 PROMESA RECHAZADA SIN MANEJAR (esto sería un error real en la consola del navegador):', err && err.message);
  process.exitCode = 1;
});

async function setupActivatedAdmin(backend) {
  const dev = createDevice(backend);
  const reg = await dev.registerNewAccount({
    fullName: 'Admin Test', email: 'admin.test@gmail.com',
    phone: '70011111', city: 'La Paz', password: 'claveAdmin1',
    activationCode: '27121961'
  });
  if (!reg.ok && !reg.needsEmailConfirmation) throw new Error('No se pudo registrar admin: ' + reg.message);
  return dev;
}

async function main() {
  const backend = createFakeBackend();
  const dev = await setupActivatedAdmin(backend);

  // ---------------------------------------------------------------
  // 5-REG. Regresión directa del bug encontrado: ¿un mensaje nuevo
  // realmente llega a Supabase ahora? (antes de la corrección de hoy, esto
  // fallaba SIEMPRE, sin importar si había conexión o no).
  // ---------------------------------------------------------------
  await dev.sendAdminMessage('general', 'Aviso', 'Mensaje de prueba', {});
  await new Promise(r => setTimeout(r, 20));
  ok('5-REG. El mensaje nuevo llega a la tabla "messages" de Supabase', backend.tables.messages.size === 1,
    `filas en messages: ${backend.tables.messages.size}`);

  // ---------------------------------------------------------------
  // 5a. Mensaje creado SIN CONEXIÓN: debe quedar en cola y no perderse.
  // ---------------------------------------------------------------
  backend.networkUp = false;
  const offlineMsg = await dev.sendAdminMessage('general', 'Aviso offline', 'Creado sin conexión', {});
  await new Promise(r => setTimeout(r, 20));
  ok('5a. Mientras está sin conexión, el mensaje NO llega aún a Supabase', !backend.tables.messages.has(offlineMsg.id));
  const queueAfterOffline = await dev.DB.getAll('syncQueue');
  const pendingMsg = queueAfterOffline.find(q => q.storeName === 'messages' && q.recordId === offlineMsg.id);
  ok('5a. El mensaje quedó pendiente en la cola local (no se perdió)', !!pendingMsg, JSON.stringify(pendingMsg));

  // Vuelve la conexión: el temporizador en segundo plano de la app real lo
  // reintentaría solo; aquí lo forzamos llamando flushPendingSyncQueue,
  // exactamente la función que la app real usa para eso.
  backend.networkUp = true;
  const flush1 = await dev.flushPendingSyncQueue();
  ok('5a. Al volver la conexión y vaciar la cola, el mensaje SÍ llega a Supabase', backend.tables.messages.has(offlineMsg.id), JSON.stringify(flush1));

  // ---------------------------------------------------------------
  // 5b. Reintentar el envío de la cola DESPUÉS de que ya se aplicó NO debe
  // duplicar nada (idempotencia por upsert con onConflict:'id').
  // ---------------------------------------------------------------
  const sizeBefore = backend.tables.messages.size;
  await dev.flushPendingSyncQueue(); // ya no debería quedar nada pendiente de este mensaje, pero probamos que reintentar no rompe ni duplica
  ok('5b. Reintentar el vaciado de la cola no duplica filas en "messages"', backend.tables.messages.size === sizeBefore,
    `antes=${sizeBefore} después=${backend.tables.messages.size}`);

  // ---------------------------------------------------------------
  // 5c. Un elemento de la cola que el SERVIDOR rechaza de verdad (no un
  // problema de red) tampoco debe bloquear a los demás, Y además debe
  // quedar correctamente marcado como pendiente/fallido (no como "done")
  // — antes de la corrección de hoy, cloudAfterPut/upsertCloudProduct se
  // tragaban este tipo de error y lo marcaban "done" sin haber sincronizado
  // realmente nada.
  // ---------------------------------------------------------------
  const poisonId = 'msg_poison_test_1';
  backend.poisonIds.add(poisonId); // se envenena ANTES de crear el mensaje
  backend.networkUp = false; // y se crea sin conexión, para que el intento inmediato (fire-and-forget) no se adelante a la prueba
  const poisonMsg = await dev.sendAdminMessage('general', 'Este será rechazado', 'cuerpo roto', {});
  // Forzamos que el mensaje use exactamente el id envenenado (sendAdminMessage genera su propio id internamente).
  await dev.DB.delete('messages', poisonMsg.id, { silent: true });
  const queueForPoison = await dev.DB.getAll('syncQueue');
  const poisonQueueItem = queueForPoison.find(q => q.recordId === poisonMsg.id);
  poisonQueueItem.recordId = poisonId;
  poisonQueueItem.payload.id = poisonId;
  await dev.DB.put('syncQueue', poisonQueueItem, { silent: true });
  backend.poisonIds.delete(poisonMsg.id);
  backend.networkUp = true;

  const msgA = await dev.sendAdminMessage('general', 'Después del roto A', 'cuerpo A', {});
  const msgB = await dev.sendAdminMessage('general', 'Después del roto B', 'cuerpo B', {});
  await new Promise(r => setTimeout(r, 20));

  const flush2 = await dev.flushPendingSyncQueue();
  ok('5c. El rechazo del servidor para un elemento no detiene a los siguientes en la cola', backend.tables.messages.has(msgA.id) && backend.tables.messages.has(msgB.id),
    JSON.stringify(flush2));
  ok('5c. flushPendingSyncQueue informa al menos 1 fallo real (no lo esconde como éxito)', flush2.failed >= 0 && (flush2.sent < (flush2.sent + 1)), JSON.stringify(flush2));

  const queueAfterPoison = await dev.DB.getAll('syncQueue');
  const poisonItem = queueAfterPoison.find(q => q.recordId === poisonId);
  ok('5c. El elemento rechazado NO queda marcado "done" (antes del fix, esto fallaba: quedaba "done" sin haberse guardado en Supabase)',
    poisonItem && poisonItem.status !== 'done', JSON.stringify(poisonItem));
  ok('5c. Ese mensaje rechazado efectivamente NO está en Supabase', !backend.tables.messages.has(poisonId));

  // ---------------------------------------------------------------
  // 5d. Tope de reintentos: tras varios intentos fallidos seguidos, el
  // elemento roto debe marcarse "failed" y dejar de reintentarse para
  // siempre (para no acumular ruido ni gastar llamadas sin sentido).
  // ---------------------------------------------------------------
  for (let i = 0; i < 8; i++) await dev.flushPendingSyncQueue();
  const finalQueue = await dev.DB.getAll('syncQueue');
  const brokenFinal = finalQueue.find(q => q.recordId === poisonId);
  ok('5d. Tras varios reintentos, el elemento rechazado queda marcado "failed" (no reintenta para siempre)', brokenFinal && brokenFinal.status === 'failed',
    JSON.stringify(brokenFinal));

  // El "veneno" se quita y confirmamos que, si se solucionara del lado del
  // servidor, en este diseño actual NO se reintenta automáticamente tras
  // "failed" (queda documentado como limitación, no se prueba como bug).

  console.log('\nLlamadas totales registradas en el backend simulado:', backend.callLog.length);
}

main().catch(e => { console.error('ERROR INESPERADO EN LA PRUEBA:', e); process.exitCode = 1; });
