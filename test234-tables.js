'use strict';
const { createDevice, createFakeBackend } = require('./harness');

function ok(label, cond, extra) {
  console.log((cond ? '✅ PASA' : '❌ FALLA') + ' — ' + label + (extra ? ' | ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

let unhandled = 0;
process.on('unhandledRejection', (err) => {
  unhandled++;
  console.log('🛑 PROMESA RECHAZADA SIN MANEJAR:', err && err.message);
});

async function main() {
  const backend = createFakeBackend();
  const dev = createDevice(backend);
  await dev.ensureBootstrapData();
  await dev.registerNewAccount({ fullName:'Admin Test', email:'admin.test@gmail.com', phone:'70011111', city:'La Paz', password:'claveAdmin1', activationCode:'27121961' });

  backend.networkUp = false;

  // Esto es exactamente lo que dispara el botón "Recibir novedades" /
  // "Actualizar de forma segura" cuando se presiona sin conexión.
  const result = await dev.syncCloudProductsToLocal({ full: true }).catch(err => ({ threw: true, message: err.message }));
  ok('No lanza una excepción sin manejar al sincronizar sin conexión (devuelve {ok:false} en vez de colgar el botón)',
    !result.threw, JSON.stringify(result));
  ok('Devuelve un mensaje de error utilizable para mostrarle a la persona', result.ok === false && typeof result.message === 'string' && result.message.length > 0,
    JSON.stringify(result));

  await new Promise(r => setTimeout(r, 30));
  ok('No quedó ninguna promesa rechazada sin manejar en toda la prueba (lo vería la consola del navegador)', unhandled === 0, `total=${unhandled}`);

  // Confirmamos también que, al volver la conexión, todo funciona normal de nuevo.
  backend.networkUp = true;
  const okAgain = await dev.syncCloudProductsToLocal({ full: true });
  ok('Al volver la conexión, la sincronización vuelve a funcionar con normalidad', okAgain.ok === true, JSON.stringify(okAgain));
}

main().catch(e => { console.error('ERROR INESPERADO EN LA PRUEBA:', e); process.exitCode = 1; });
