// Natura Vida V10.1 - evita ampliar exposicion publica de datos comerciales.
// El archivo historico permitido es un riesgo conocido, no una excepcion permanente.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const legacy='gabriela-espinoza-mi-negocio.json';
const imports=path.join(root,'data','imports');
assert(!fs.existsSync(path.join(imports,legacy)), 'Los datos de clientes NO deben estar en el sitio publico');
const all=fs.existsSync(imports)?fs.readdirSync(imports).filter(x=>x.toLowerCase().endsWith('.json')):[];
assert.deepEqual(all,[],'No publicar exportaciones de datos comerciales');
const financial=fs.readFileSync(path.join(root,'js/v8-financial-accounts.js'),'utf8');
assert(!financial.includes("fetch('data/imports/"),'El modulo no debe leer datos de clientes desde URL publica');
assert(financial.includes("$('#nv820ImportFile',overlay).click()"),'El usuario conserva la importacion mediante archivo privado');
const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const assets=sw.split('const OPTIONAL_APP_ASSETS = [')[1]?.split('];')[0]||'';
assert(!assets.includes('data/imports/'), 'Nunca precachear importaciones comerciales privadas');
assert(sw.includes('cache.delete(legacyUrl'), 'Falta depurar las copias antiguas en caché');
const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
assert(ignore.includes('data/imports/**'),'No se ignoran futuros archivos de importacion');
const sql=fs.readFileSync(path.join(root,'supabase/rls_audit_readonly_v102.sql'),'utf8');
const statements=sql.split(/\n/).filter(x=>!x.trim().startsWith('--')).join('\n');
assert.equal((statements.match(/\bselect\b/gi)||[]).length>=5,true,'Faltan consultas de seguridad');
assert(!/\b(create|alter|drop|truncate|grant|revoke)\s+(table|policy|function|view|role|schema)/i.test(statements),'La auditoria nunca debe modificar la base');
console.log('OK: barrera contra nuevas importaciones publicas, cache comercial y auditoria RLS solo lectura.');
