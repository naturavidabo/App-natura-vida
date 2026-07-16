#!/usr/bin/env python3
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []
checks = 0

def require(condition, message):
    global checks
    checks += 1
    if not condition:
        errors.append(message)

index = (ROOT / 'index.html').read_text(encoding='utf-8')
version = json.loads((ROOT / 'app-version.json').read_text(encoding='utf-8'))
manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
update = (ROOT / 'js/app-update.js').read_text(encoding='utf-8')
sw = (ROOT / 'service-worker.js').read_text(encoding='utf-8')
shell = (ROOT / 'js/v7-shell.js').read_text(encoding='utf-8')
management = (ROOT / 'js/v7-management-center.js').read_text(encoding='utf-8')
workforce = (ROOT / 'js/v7-workforce.js').read_text(encoding='utf-8')
distribution = (ROOT / 'js/v7-distribution.js').read_text(encoding='utf-8')
sync = (ROOT / 'js/supabase-sync.js').read_text(encoding='utf-8')
sales = (ROOT / 'js/sales.js').read_text(encoding='utf-8')
css = (ROOT / 'css/v7.css').read_text(encoding='utf-8')
groups = (ROOT / 'js/pricegroups.js').read_text(encoding='utf-8')
users = (ROOT / 'js/v7-profile-users.js').read_text(encoding='utf-8')

require(index.lstrip().lower().startswith('<!doctype html>'), 'index.html no comienza con DOCTYPE HTML')
require(version.get('version') == '7.7.0', 'app-version.json no indica V7.7.0')
require("CURRENT_VERSION = '7.7.0'" in update, 'app-update.js no indica V7.7.0')
require('service-worker.js?v=7.7.0' in update, 'registro del service worker no usa V7.7.0')
require('natura-vida-v7-7-0' in sw.lower(), 'caché del service worker no corresponde a V7.7.0')
require('V7.7' in manifest.get('name', ''), 'manifest no corresponde a V7.7')
require('v7-management-center.js?v=7.7.0' in index, 'index no carga el Centro de gestión V7.7')
require('v7-workforce.js?v=7.7.0' in index, 'index no carga Personal V7.7')
require(index.index('v7-management-center.js') < index.index('v7-shell.js'), 'Centro de gestión debe cargar antes del shell')
require(index.index('v7-workforce.js') < index.index('v7-shell.js'), 'Personal debe cargar antes del shell')
require("case 'personal'" in shell and "'personal'].includes(tab)" in shell, 'navegación no habilita Personal por rol')
require('renderManagementCenterV770' in shell, 'Más no delega al nuevo Centro de gestión')
require('Buscar clientes, rutas, personal, egresos' in management, 'Centro de gestión no incluye buscador funcional')
require("readArray('favorites')" in management and "readArray('recents')" in management and 'localStorage' in management, 'Centro de gestión no conserva favoritos y recientes')
require("category: 'administracion'" in management and "category: 'operaciones'" in management, 'Centro de gestión no separa Administración y Operaciones')
require('salesCatalogV770' in sales and 'openCatalogPdfOptions' in sales, 'Catálogo no está visible en el flujo de Ventas')
require('Mis grupos de precio' in groups and 'representative_local' in groups, 'grupos propios del representante no están habilitados')
require('Condición central de compra' in users, 'no se diferencia la condición central de compra del representante')
require('staff_members' in workforce and 'staff_tasks' in workforce and 'staff_attendance' in workforce, 'módulo Personal incompleto')
require('labor_costs' in workforce and 'staff_payments' in workforce, 'mano de obra o pagos no están implementados')
require('handleDistributionRealtimeV770' in distribution and 'realtimeTimer' in distribution, 'Distribución no agrupa eventos Realtime')
require('patchRouteDetailV770' in distribution and 'mapSignature' in distribution, 'Distribución no actualiza parcialmente ni conserva el mapa')
require("handleDistributionRealtimeV770(table, payload)" in sync, 'Supabase sigue forzando render general para Distribución')
require("handleWorkforceRealtimeV770(table, payload)" in sync, 'Supabase no trata Personal de forma silenciosa')
require('v770SalesTools' in css and 'v770CategoryGrid' in css and 'v770WorkHero' in css, 'estilos V7.7 incompletos')
require('linear-gradient(115deg' in css and 'v770OrganicGlow' in css, 'renovación visual verde/degradada no está incluida')
require(not list(ROOT.rglob('*.sql')), 'el paquete del sitio contiene archivos SQL')
require((ROOT / '.nojekyll').exists(), 'falta .nojekyll')
require((ROOT / '.node-version').read_text().strip() == '24', 'Node no está fijado en versión 24')

for js in sorted((ROOT / 'js').glob('*.js')):
    result = subprocess.run(['node', '--check', str(js)], capture_output=True, text=True)
    require(result.returncode == 0, f'Error de sintaxis en {js.name}: {result.stderr.strip()}')

if errors:
    print(f'Auditoría V7.7.0: {checks-len(errors)}/{checks} controles OK')
    for error in errors:
        print('ERROR:', error)
    sys.exit(1)
print(f'Auditoría V7.7.0: {checks}/{checks} controles OK')
