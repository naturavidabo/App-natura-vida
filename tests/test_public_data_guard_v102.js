// Natura Vida V10.1 - evita ampliar exposicion publica de datos comerciales.
// El archivo historico permitido es un riesgo conocido, no una excepcion permanente.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const legacy='gabriela-espinoza-mi-negocio.json';
const imports=path.join(root,'data','imports');
const allowedBlob='0450a43bdf9b7b05775365d76f0414dcb9935909';
const raw=fs.readFileSync(path.join(imports,legacy));
const actualBlob=crypto.createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
assert.equal(actualBlob,allowedBlob,'El archivo historico fue alterado: revisar y proteger antes de cambiar su contenido');
const all=fs.readdirSync(imports).filter(x=>x.toLowerCase().endsWith('.json'));
assert.deepEqual(all,[legacy],'No publicar nuevos archivos JSON comerciales en data/imports');
const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const assets=sw.split('const OPTIONAL_APP_ASSETS = [')[1]?.split('];')[0]||'';
assert(!assets.includes('data/imports/'), 'Nunca precachear importaciones comerciales privadas');
assert(sw.includes('cache.delete(legacyUrl'), 'Falta depurar las copias antiguas en caché');
const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
assert(ignore.includes('data/imports/**'),'No se ignoran futuros archivos de importacion');
const sql=fs.readFileSync(path.join(root,'security/rls_audit_readonly_v102.sql'),'utf8');
const statements=sql.split(/\n/).filter(x=>!x.trim().startsWith('--')).join('\n');
assert.equal((statements.match(/\bselect\b/gi)||[]).length>=5,true,'Faltan consultas de seguridad');
assert(!/\b(create|alter|drop|truncate|grant|revoke)\s+(table|policy|function|view|role|schema)/i.test(statements),'La auditoria nunca debe modificar la base');
console.log('OK: barrera contra nuevas importaciones publicas, cache comercial y auditoria RLS solo lectura.');
