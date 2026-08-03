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
const shell=read('js/v7-shell.js');
const ai=read('js/v8-ai-assistant.js');

assert.equal(version.version,'8.4.0');
assert(index.includes('@supabase/supabase-js@2.111.0'),'Supabase debe estar fijado a 2.111.0');
assert(index.includes('js/v8-ai-assistant.js?v=8.4.0'));
assert.equal(manifest.start_url,'./index.html?v=8.4.0');
assert(sw.includes("APP_CACHE = 'nv-app-shell-v840'"));
assert(sw.includes("RUNTIME_CACHE = 'nv-runtime-v840'"));

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

const count=(()=>{let n=0;const walk=d=>fs.readdirSync(d,{withFileTypes:true}).forEach(e=>e.isDirectory()?walk(path.join(d,e.name)):n++);walk(root);return n;})();
assert(count<=100,`demasiados archivos: ${count}`);
console.log(`V8.4.0 OK: sesión persistente, actualización segura, control de cambios y centro administrativo; ${count} archivos.`);
