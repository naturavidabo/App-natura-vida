#!/usr/bin/env python3
from pathlib import Path
import json, re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
errors=[]
checks=[]

def ok(cond, msg):
    checks.append((cond,msg))
    if not cond: errors.append(msg)

required = [
    'index.html','manifest.json','service-worker.js','app-version.json',
    'css/app.css','css/v7.css','js/app.js','js/supabase-config.js',
    'js/v7-commercial-center.js','js/v7-profile-users.js','js/v7-shell.js',
    'sql/2026-07-15_v7_3_0_representative_pricing.sql','sql/2026-07-15_v7_3_0_verify.sql'
]
for rel in required:
    p=ROOT/rel
    ok(p.is_file() and p.stat().st_size>0, f'Archivo requerido ausente o vacío: {rel}')

version=json.loads((ROOT/'app-version.json').read_text(encoding='utf-8')).get('version')
ok(version=='7.3.0', f'Versión inesperada: {version}')
html=(ROOT/'index.html').read_text(encoding='utf-8')
ok('v7-commercial-center.js?v=7.3.0' in html, 'Módulo comercial V7.3 no cargado en index.html')
ok('V7.3.0' in html, 'Título V7.3.0 ausente en index.html')

# Referencias locales HTML
for attr in re.findall(r'(?:src|href)="([^"]+)"', html):
    if attr.startswith(('http://','https://','data:','#')): continue
    rel=attr.split('?',1)[0].lstrip('./')
    ok((ROOT/rel).exists(), f'Recurso local inexistente: {rel}')

# Sintaxis JS
js_files=sorted((ROOT/'js').glob('*.js'))
for js in js_files:
    proc=subprocess.run(['node','--check',str(js)],capture_output=True,text=True)
    ok(proc.returncode==0, f'Error de sintaxis JS en {js.name}: {proc.stderr.strip()}')

all_js='\n'.join(p.read_text(encoding='utf-8') for p in js_files)
for token in [
    'openRepresentativeDetailV730','saveRepresentativeConfigV730',
    'renderCommercialCenterV730','openClientBenefitV730',
    'receivableSalesV725','fetchRepresentativeStockForAdminV725'
]:
    ok(token in all_js, f'Función crítica ausente: {token}')

# Evitar regresiones conocidas
ok("'expenses','receivablePayments','expenses','receivablePayments'" not in all_js, 'Stores duplicados en db.js')
ok('window.openClientBenefitV725 = openClientBenefitV725;' not in all_js, 'Exportación rota de openClientBenefitV725')
ok('tests/audit_static.py' in (ROOT/'.github/workflows/deploy-pages.yml').read_text(encoding='utf-8'), 'Workflow no ejecuta auditoría estática')

print(f'Auditoría estática V7.3: {sum(1 for c,_ in checks if c)}/{len(checks)} controles OK')
if errors:
    for e in errors: print('ERROR:',e)
    sys.exit(1)
