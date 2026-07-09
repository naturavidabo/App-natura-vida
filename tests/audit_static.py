#!/usr/bin/env python3
from pathlib import Path
from html.parser import HTMLParser
import json, re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
failures = []
passes = []

def check(condition, label, detail=''):
    (passes if condition else failures).append((label, detail))

class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.assets=[]
    def handle_starttag(self, tag, attrs):
        data=dict(attrs)
        if tag == 'script' and data.get('src'): self.assets.append(data['src'])
        if tag == 'link' and data.get('href') and data.get('rel') in ('stylesheet','manifest','icon','apple-touch-icon'):
            self.assets.append(data['href'])

index=(ROOT/'index.html').read_text(encoding='utf-8')
parser=AssetParser(); parser.feed(index)
local_assets=[]
for asset in parser.assets:
    if asset.startswith(('http://','https://','//')): continue
    path=asset.split('?',1)[0].lstrip('./')
    local_assets.append(path)
    check((ROOT/path).is_file(), f'Existe recurso: {path}')

check('7.2.0' in index, 'HTML publica versión 7.2.0')
check('app-update.js?v=7.2.0' in index, 'Gestor de actualización incluido')
check(not re.search(r'\?v=7\.1\.', index), 'No quedan recursos HTML con versión 7.1.x')

version=json.loads((ROOT/'app-version.json').read_text())
check(version.get('version')=='7.2.0','app-version.json coincide con 7.2.0')

# Sintaxis JavaScript con Node.
for js in sorted((ROOT/'js').glob('*.js')) + [ROOT/'service-worker.js']:
    result=subprocess.run(['node','--check',str(js)],capture_output=True,text=True)
    check(result.returncode==0, f'Sintaxis JS: {js.name}', result.stderr.strip())

sync=(ROOT/'js/supabase-sync.js').read_text()
check("rpc('register_sale_atomic'" in sync, 'Venta usa RPC atómica')
check('findCloudSaleById' in sync and 'recovered: true' in sync, 'Venta verifica ID antes de duplicar reintento')
check('audit_log' in sync and 'user_id' in sync, 'Error audit_log tiene mensaje controlado')

sales=(ROOT/'js/sales.js').read_text()
rep_sales=(ROOT/'js/v7-inventory-sales.js').read_text()
for name, text in [('venta administrador',sales),('venta representante',rep_sales)]:
    check("id: uid('sale')" in text, f'{name}: ID estable por operación')
    check('Reintentar la misma operación' in text, f'{name}: reintento idempotente visible')
    check('syncCloudProductsToLocal' in text and 'Stock insuficiente' in text, f'{name}: revalida stock online')
    check('stickyActions' in text, f'{name}: botón visible sobre teclado')

profile=(ROOT/'js/v7-profile-users.js').read_text()
check('Fallback seguro' not in profile and 'imagen interna del perfil' not in profile, 'QR no usa dataURL como persistencia falsa')
check('qrVerified' in profile, 'QR se vuelve a consultar y verificar en Supabase')
check('removeQrRequested' in profile and 'deletePaymentQrV7' in profile, 'QR puede eliminarse de perfil y Storage')

inbox=(ROOT/'js/inbox.js').read_text()
check('openMessageComposer' in inbox, 'Buzón incluye compositor directo')
check('Escribir al administrador' in inbox, 'Representante puede escribir al administrador')
check('replyMessageBtn' in inbox, 'Administrador puede responder al representante')

catalog=(ROOT/'js/catalog-pdf.js').read_text()
check('imageCoverInfoForPdf' in catalog, 'PDF rellena el marco de fotografía con recorte equilibrado')
check('includePaymentQr' in catalog and 'QR para pagos' in catalog, 'Catálogo permite incluir QR propio')

css=(ROOT/'css/v7.css').read_text()
cover_pos=css.rfind('object-fit:cover!important')
contain_pos=css.rfind('.v7QrCurrent img{object-fit:contain!important')
check(cover_pos > 0, 'CSS final usa cover para fotos comerciales')
check(contain_pos > cover_pos, 'QR conserva contain después de regla cover')
check('.sheet.keyboard-open' in css and 'visual-height' in css, 'CSS responde al teclado móvil')
check('.nvSheetActions' in css, 'Acciones de formulario pueden quedar fijas')

update=(ROOT/'js/app-update.js').read_text()
sw=(ROOT/'service-worker.js').read_text()
check('registration.update()' in update and 'SKIP_WAITING' in update, 'Actualizador consulta y activa service worker')
check("cache: 'no-store'" in sw and 'Sin conexión' in sw, 'PWA usa red obligatoria y pantalla offline clara')

sql=(ROOT/'sql/2026-07-09_v7_2_0_stabilization.sql').read_text()
for needle,label in [
    ('alter table public.audit_log add column if not exists user_id uuid','Migración corrige audit_log.user_id'),
    ('update_my_commercial_profile_v7','Migración asegura perfil comercial'),
    ("'payment-assets'",'Migración asegura bucket QR'),
    ('nv72_messages_insert','Migración asegura escritura del buzón'),
    ('begin;','Migración inicia transacción'),('commit;','Migración confirma transacción')]:
    check(needle in sql,label)

# Ningún archivo inesperadamente vacío.
for path in ROOT.rglob('*'):
    if path.is_file(): check(path.stat().st_size>0,f'Archivo no vacío: {path.relative_to(ROOT)}')

print(f'PASS={len(passes)} FAIL={len(failures)}')
for label,detail in failures:
    print('FAIL:',label)
    if detail: print(detail)
if failures:
    sys.exit(1)
print('Auditoría estática completada sin fallos.')
