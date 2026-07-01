'use strict';
const { createDevice, createFakeBackend } = require('./harness');

function ok(label, cond, extra) {
  console.log((cond ? '✅ PASA' : '❌ FALLA') + ' — ' + label + (extra ? ' | ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

async function main() {
  const backend = createFakeBackend();

  // ---------------------------------------------------------------
  // DISPOSITIVO 1: primera activación del administrador
  // ---------------------------------------------------------------
  const dev1 = createDevice(backend);
  await dev1.ensureBootstrapData();

  const loginSeed = await dev1.authenticateUser('admin', '12345678');
  ok('1a. Login inicial admin/12345678 funciona (modo local, primera vez)', loginSeed.ok && loginSeed.online === false, JSON.stringify(loginSeed));
  ok('1a. mustChangePassword queda en true tras el primer login', dev1.AppState.session.mustChangePassword === true);

  const activation = await dev1.updateLocalPassword(dev1.AppState.session.userId, 'miClaveSegura1', {
    username: '70011111', fullName: 'Cristhian Admin', phone: '70011111', activationCode: '27121961'
  });
  ok('1b. Activación local exitosa', activation.ok, JSON.stringify(activation.message || ''));
  ok('1b. Se intentó vincular con Supabase', !!(activation.cloud && activation.cloud.attempted));
  ok('1b. Vinculación con Supabase exitosa', !!(activation.cloud && activation.cloud.ok), JSON.stringify(activation.cloud));
  ok('1b. Se adoptó sesión ONLINE de inmediato tras activar', dev1.AppState.session.online === true);
  ok('1b. AppState.session.onlineUserId quedó con un uuid real', typeof dev1.AppState.session.onlineUserId === 'string' && dev1.AppState.session.onlineUserId.length > 10);

  const cloudUid = dev1.AppState.session.onlineUserId;
  const profileRow = backend.tables.profiles.get(cloudUid);
  ok('1b. La fila en profiles tiene id = auth.uid() real (no un id local)', !!profileRow && profileRow.id === cloudUid, JSON.stringify(profileRow));
  ok('1b. El perfil quedó con status "activo" (valor canónico V6.6)', profileRow && profileRow.status === 'activo');

  // ---------------------------------------------------------------
  // DISPOSITIVO 2: el MISMO administrador entra desde un celular nuevo
  // ---------------------------------------------------------------
  const dev2 = createDevice(backend);
  await dev2.ensureBootstrapData();
  const loginDev2 = await dev2.authenticateUser('70011111', 'miClaveSegura1');
  ok('1c. Segundo dispositivo: login exitoso', loginDev2.ok, JSON.stringify(loginDev2));
  ok('1c. Segundo dispositivo: el login fue ONLINE (no local) — confirma que Supabase es la fuente principal', loginDev2.online === true);
  ok('1c. Segundo dispositivo: mismo auth.uid() que el dispositivo 1', dev2.AppState.session.onlineUserId === cloudUid,
    `dev1=${cloudUid} dev2=${dev2.AppState.session.onlineUserId}`);

  // Contraseña incorrecta desde el segundo dispositivo: debe rechazar, no caer a ningún acceso local viejo.
  const wrongPass = await dev2.authenticateUser('70011111', 'claveIncorrecta');
  ok('1c. Contraseña incorrecta es rechazada también desde un dispositivo nuevo', wrongPass.ok === false, JSON.stringify(wrongPass));

  // ---------------------------------------------------------------
  // MIGRACIÓN AUTOMÁTICA: cuenta "vieja" personalizada ANTES de V6.2,
  // simulada creando el usuario local directamente (sin pasar por
  // updateLocalPassword), como quedarían las cuentas reales de antes de
  // esta actualización.
  // ---------------------------------------------------------------
  const dev3 = createDevice(backend);
  await dev3.ensureBootstrapData();
  const legacyUser = {
    id: 'user_legacy_rep', seedSlot: null, username: '70099999', fullName: 'Representante Viejo',
    roleId: 'role_reseller', role: 'Revendedor',
    passwordHash: await dev3.sha256Hex('claveVieja123'),
    mustChangePassword: false, status: 'active', createdAt: Date.now(), updatedAt: Date.now()
    // sin cloudLinked / cloudUserId — así quedaban las cuentas reales antes de V6.2
  };
  await dev3.DB.put('users', legacyUser, { silent: true });

  const legacyLogin = await dev3.authenticateUser('70099999', 'claveVieja123');
  ok('1d. Cuenta vieja (no vinculada) inicia sesión igual (modo local, ya que Supabase todavía no la conoce)', legacyLogin.ok && legacyLogin.online === false, JSON.stringify(legacyLogin));

  // La migración se dispara en segundo plano (fire-and-forget); como en
  // las pruebas no hay timers reales de red, esperamos un microtask extra.
  await new Promise(r => setTimeout(r, 50));
  const migratedUser = await dev3.DB.get('users', 'user_legacy_rep');
  ok('1d. Tras un login exitoso, la cuenta vieja quedó vinculada a Supabase automáticamente', !!migratedUser.cloudLinked, JSON.stringify(migratedUser));

  if (migratedUser.cloudLinked) {
    const dev4 = createDevice(backend);
    const legacyOnlineLogin = await dev4.authenticateUser('70099999', 'claveVieja123');
    ok('1d. Esa misma cuenta vieja ya puede entrar ONLINE desde un dispositivo nuevo', legacyOnlineLogin.ok && legacyOnlineLogin.online === true, JSON.stringify(legacyOnlineLogin));
  }

  console.log('\n--- Llamadas registradas al backend simulado (auth) ---');
  backend.callLog.filter(c => c.auth).forEach(c => console.log(' ', c.auth, c.email));
}

main().catch(e => { console.error('ERROR INESPERADO EN LA PRUEBA:', e); process.exitCode = 1; });
