const fs=require('fs'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const version=JSON.parse(read('app-version.json'));
const index=read('index.html');
const manifest=JSON.parse(read('manifest.json'));
const sw=read('service-worker.js');
const auth=read('js/supabase-sync.js');
const updater=read('js/app-update.js');
const dirty=read('js/v8-offline-continuity.js');
const rlsFix=read('supabase/migrations/20261009135033_tighten_commercial_profile_team_visibility_v1011.sql');
assert(rlsFix.includes('DROP POLICY IF EXISTS nv72_commercial_profiles_select'), 'La lectura general de perfiles debe retirarse');
assert(rlsFix.includes('nv800_can_view_user(user_id)'), 'Los perfiles deben limitarse a propietario, administracion y equipo autorizado');
assert(!/USING\s*\(\s*true\s*\)/i.test(rlsFix), 'La nueva regla RLS no puede permitir lectura general');
const shell=read('js/v7-shell.js');
const ai=read('js/v8-ai-assistant.js');
const aiBridge=read('js/v9-ai-bridge.js');

assert.equal(version.version,'10.1.8');
assert(index.includes('@supabase/supabase-js@2.111.0'),'Supabase debe estar fijado a 2.111.0');
assert(index.includes('js/v9-ai-bridge.js?v=10.1.8'),'El arranque debe usar el puente IA liviano');
assert(!index.includes('<script src="js/v8-ai-assistant.js?v=10.1.8"></script>'),'La IA pesada no debe bloquear el arranque');
assert(aiBridge.includes("s.src='js/v8-ai-assistant.js?v=10.1.8'"),'El puente debe cargar la IA completa bajo demanda');
assert.equal(manifest.start_url,'./index.html?v=10.1.8');
assert(/APP_CACHE = 'nv-app-shell-v10-/.test(sw),'La rama V9 debe usar una generación propia de app cache');
assert(/RUNTIME_CACHE = 'nv-runtime-v10-/.test(sw),'La rama V9 debe usar una generación propia de runtime cache');

for(const token of [
  'AuthStorageV840','natura-vida-auth-v840','indexedDB.open',
  'navigator.storage.persist','NV840_AUTH_RECOVERY_PREFIX',
  'writeAuthRecoveryEnvelopeV840','explicitAuthRemovalV840',
  "storage: AuthStorageV840","storageKey: NV840_AUTH_STORAGE_KEY"
]) assert(auth.includes(token),`Falta protección de sesión: ${token}`);
assert(auth.includes("signOut({ scope })"),'El cierre debe respetar scope local');
assert(auth.includes("options.scope || 'local'"),'El cierre normal debe ser local');

for(const token of ['canReloadSafelyV840','mirrorAuthStorageV840','prepareSessionForUpdateV833','Ya tienes la versión más reciente'])
  assert(updater.includes(token),`Falta actualización segura: ${token}`);
assert(!updater.includes('.unregister('),'La actualización no debe desregistrar el Service Worker');

for(const token of ['shouldTrackDirtyFieldV840','hasMeaningfulDirtyFormV840','data-nv-dirty-changed','data-nv-no-dirty'])
  assert(dirty.includes(token),`Falta control de edición real: ${token}`);
assert(shell.includes('hasMeaningfulDirtyFormV840'),'La navegación debe ignorar falsos cambios');
assert(!shell.includes("confirm('Hay cambios sin guardar en esta pantalla"),'No debe conservarse el aviso antiguo global');

for(const token of ['Director Administrativo','openAdministrativeCenterV840','Centro administrativo','__nvAiV840'])
  assert(ai.includes(token),`Falta consolidación administrativa: ${token}`);

const publicCount=(()=>{let n=4;const walk=d=>fs.readdirSync(d,{withFileTypes:true}).forEach(e=>e.isDirectory()?walk(path.join(d,e.name)):n++);for(const dir of ['js','css','icons','img','data']){const full=path.join(root,dir);if(fs.existsSync(full))walk(full);}return n;})();
assert(publicCount<=110,`demasiados recursos públicos de runtime: ${publicCount}`);
require('./test_local_continuity_security_v101.js');
require('./test_public_data_guard_v102.js');
require('./test_login_navigation_plans_v1012.js');
require('./test_product_inventory_save_v1013.js');
require('./test_historical_import_preview_v1014.js');
require('./test_payment_plan_existing_count_v1015.js');
require('./test_connection_truth_v1016.js');
require('./test_core_sync_integrity_v1017.js');
require('./test_payment_retry_idempotency_v1018.js');
console.log(`V10.1.8/V9 OK: sesión persistente, actualización segura, control de cambios y centro administrativo; ${publicCount} recursos públicos.`);
