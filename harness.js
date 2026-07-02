'use strict';
// test1-login.js — V6.7 (flujo Gmail puro, sin legacy)
const { createDevice, createFakeBackend } = require('./harness');

function ok(label, cond, extra) {
  console.log((cond ? 'OK PASA' : 'XX FALLA') + ' - ' + label + (extra ? ' | ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

async function main() {
  const backend = createFakeBackend();

  // 1. Primer registro => admin automatico
  const dev1 = createDevice(backend);
  const reg1 = await dev1.registerNewAccount({
    fullName: 'Cristhian Admin', email: 'cristhian@gmail.com',
    phone: '70011111', city: 'La Paz', password: 'claveAdmin1'
  });
  ok('1a. Primer registro OK', reg1.ok, JSON.stringify(reg1));
  ok('1a. Primer usuario es administrador', dev1.AppState.session && dev1.AppState.session.roleCanonical === 'administrador');
  ok('1a. Queda activo (no pendiente)', dev1.AppState.session && dev1.AppState.session.statusCanonical === 'activo');
  ok('1a. onlineUserId tiene uuid real', dev1.AppState.session && dev1.AppState.session.onlineUserId && dev1.AppState.session.onlineUserId.length > 10);

  const cloudUid = dev1.AppState.session.onlineUserId;
  const profileRow = backend.tables.profiles.get(cloudUid);
  ok('1b. Perfil en Supabase con id = auth.uid()', !!profileRow && profileRow.id === cloudUid);
  ok('1b. Perfil con status "activo"', profileRow && profileRow.status === 'activo');
  ok('1b. Perfil con email Gmail', profileRow && profileRow.email === 'cristhian@gmail.com');

  // 2. Segundo dispositivo: mismo usuario entra con loginWithEmail
  const dev2 = createDevice(backend);
  const login2 = await dev2.loginWithEmail('cristhian@gmail.com', 'claveAdmin1');
  ok('1c. Segundo dispositivo: login exitoso', login2.ok, JSON.stringify(login2));
  ok('1c. Es online (Supabase es la fuente)', dev2.AppState.session && dev2.AppState.session.online === true);
  ok('1c. Mismo onlineUserId que dev1', dev2.AppState.session && dev2.AppState.session.onlineUserId === cloudUid);

  // 3. Contrasena incorrecta
  const wrong = await createDevice(backend).loginWithEmail('cristhian@gmail.com', 'claveEquivocada');
  ok('1d. Contrasena incorrecta es rechazada', wrong.ok === false);

  // 4. Correo no-Gmail rechazado
  const badEmail = await createDevice(backend).registerNewAccount({
    fullName: 'Test', email: 'test@hotmail.com', phone: '70000001', city: 'X', password: 'pass123456'
  });
  ok('1e. Correo no-Gmail es rechazado en el registro', badEmail.ok === false);

  // 5. Recuperacion de contrasena
  const recover = await dev1.requestPasswordRecovery('cristhian@gmail.com');
  ok('1f. Recuperacion de contrasena devuelve OK', recover.ok === true, JSON.stringify(recover));

  console.log('\nLlamadas al backend:', backend.callLog.filter(c => c.auth).length, 'de auth');
}

main().catch(e => { console.error('ERROR INESPERADO:', e); process.exitCode = 1; });
