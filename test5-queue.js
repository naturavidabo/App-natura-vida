'use strict';
const { createDevice, createFakeBackend } = require('./harness');

function ok(label, cond, extra) {
  console.log((cond ? '✅ PASA' : '❌ FALLA') + ' — ' + label + (extra ? ' | ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

async function main() {
  const backend = createFakeBackend();

  // ---------------------------------------------------------------
  // 1. Primera cuenta de TODO el proyecto: debe activarse sola como
  // administrador (si no, nadie podría aprobar a nadie nunca).
  // ---------------------------------------------------------------
  const founder = createDevice(backend);
  const founderReg = await founder.registerNewAccount({ fullName: 'Cristhian Fundador', email: 'cristhian@gmail.com', phone: '70011111', city: 'La Paz', password: 'claveSegura1' });
  ok('1. El primer registro del proyecto se crea correctamente', founderReg.ok, JSON.stringify(founderReg));
  ok('1. El primer usuario queda como administrador', founder.AppState.session.roleCanonical === 'administrador', founder.AppState.session.roleCanonical);
  ok('1. El primer usuario queda ACTIVO (no pendiente)', founder.AppState.session.statusCanonical === 'activo' && founder.AppState.session.pendingApproval === false);
  ok('1. canOperate() es verdadero para el fundador', founder.canOperate() === true);

  // ---------------------------------------------------------------
  // 2. Segundo registro (un representante real): debe quedar PENDIENTE,
  // no poder operar, pero sí poder iniciar sesión para ver su estado.
  // ---------------------------------------------------------------
  const rep = createDevice(backend);
  const repReg = await rep.registerNewAccount({ fullName: 'Ana Representante', email: 'ana.representante@gmail.com', phone: '70022222', city: 'Santa Cruz', password: 'claveAna123' });
  ok('2. El segundo registro se crea correctamente', repReg.ok, JSON.stringify(repReg));
  ok('2. Queda con rol representante (no administrador)', rep.AppState.session.roleCanonical === 'representante');
  ok('2. Queda PENDIENTE de aprobación', rep.AppState.session.pendingApproval === true);
  ok('2. canOperate() es FALSO mientras está pendiente (no puede vender ni sincronizar)', rep.canOperate() === false);

  // Cierra sesión y vuelve a entrar desde otro dispositivo: debe seguir pendiente.
  const repDevice2 = createDevice(backend);
  const repLogin2 = await repDevice2.loginWithEmail('ana.representante@gmail.com', 'claveAna123');
  ok('2. Puede iniciar sesión de nuevo estando pendiente (no se bloquea el login, solo las operaciones)', repLogin2.ok && repLogin2.pendingApproval === true, JSON.stringify(repLogin2));

  // ---------------------------------------------------------------
  // 3. El administrador la aprueba: ahora debe poder operar normalmente.
  // ---------------------------------------------------------------
  const repProfileId = rep.AppState.session.onlineUserId;
  const approveResult = await founder.adminApproveUser(repProfileId);
  ok('3. El administrador puede aprobar a un representante pendiente', approveResult.ok, JSON.stringify(approveResult));

  const repDevice3 = createDevice(backend);
  const repLogin3 = await repDevice3.loginWithEmail('ana.representante@gmail.com', 'claveAna123');
  ok('3. Tras la aprobación, un nuevo inicio de sesión ya no está pendiente', repLogin3.ok && repLogin3.pendingApproval === false, JSON.stringify(repLogin3));
  ok('3. canOperate() ya es verdadero tras la aprobación', repDevice3.canOperate() === true);

  // ---------------------------------------------------------------
  // 4. Un representante NO puede aprobarse ni aprobar a otros (solo admin).
  // ---------------------------------------------------------------
  const rep2 = createDevice(backend);
  await rep2.registerNewAccount({ fullName: 'Otro Representante', email: 'otro.representante@gmail.com', phone: '70033333', city: 'Cochabamba', password: 'claveOtro123' });
  const selfApprove = await repDevice3.adminApproveUser(rep2.AppState.session.onlineUserId);
  ok('4. Un representante (no admin) no puede aprobar usuarios', selfApprove.ok === false, JSON.stringify(selfApprove));

  // ---------------------------------------------------------------
  // 5. Bloqueo y desbloqueo de usuario.
  // ---------------------------------------------------------------
  const blockResult = await founder.adminBlockUser(repProfileId);
  ok('5. El administrador puede bloquear a un usuario', blockResult.ok, JSON.stringify(blockResult));

  const blockedLoginAttempt = await createDevice(backend).loginWithEmail('ana.representante@gmail.com', 'claveAna123');
  ok('5. Un usuario bloqueado NO puede iniciar sesión', blockedLoginAttempt.ok === false, JSON.stringify(blockedLoginAttempt));

  const unblockResult = await founder.adminUnblockUser(repProfileId);
  ok('5. El administrador puede desbloquear a un usuario', unblockResult.ok, JSON.stringify(unblockResult));
  const unblockedLoginAttempt = await createDevice(backend).loginWithEmail('ana.representante@gmail.com', 'claveAna123');
  ok('5. Tras desbloquear, el usuario puede iniciar sesión de nuevo', unblockedLoginAttempt.ok === true, JSON.stringify(unblockedLoginAttempt));

  // ---------------------------------------------------------------
  // 6. Recuperación de contraseña por correo.
  // ---------------------------------------------------------------
  const recovery = await founder.requestPasswordRecovery('ana.representante@gmail.com');
  ok('6. Se puede solicitar recuperación de contraseña para un correo existente', recovery.ok, JSON.stringify(recovery));

  // ---------------------------------------------------------------
  // 7. Lista de usuarios para el panel de administración.
  // ---------------------------------------------------------------
  const list = await founder.fetchAllProfilesForAdmin();
  ok('7. El administrador puede listar todos los usuarios', list.ok && Array.isArray(list.profiles) && list.profiles.length === 3,
    `cantidad=${list.profiles ? list.profiles.length : 'N/A'}`);

  // ---------------------------------------------------------------
  // 8. Validaciones básicas: correo inválido, contraseña corta.
  // ---------------------------------------------------------------
  const badEmail = await createDevice(backend).registerNewAccount({ fullName: 'Test', email: 'no-es-correo', phone: '70000000', city: 'LaPaz', password: 'claveValida1' });
  ok('8. Rechaza un correo sin formato válido', badEmail.ok === false);
  const badPass = await createDevice(backend).registerNewAccount({ fullName: 'Test', email: 'test2.prueba@gmail.com', phone: '70000000', city: 'LaPaz', password: '123' });
  ok('8. Rechaza una contraseña de menos de 6 caracteres', badPass.ok === false);
}

main().catch(e => { console.error('ERROR INESPERADO EN LA PRUEBA:', e); process.exitCode = 1; });
