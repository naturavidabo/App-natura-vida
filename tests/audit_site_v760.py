#!/usr/bin/env python3
from pathlib import Path
import json, re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
checks = []

def require(condition, message):
    checks.append((bool(condition), message))
    if not condition:
        print('ERROR:', message)

required = [
    'index.html', 'manifest.json', 'service-worker.js', 'app-version.json',
    'css/app.css', 'css/v7.css', 'js/app.js', 'js/supabase-config.js',
    'js/v7-shell.js', 'js/v7-regional.js', 'js/v7-distribution.js',
    'js/pricegroups.js', 'js/sales.js', 'js/clients.js', 'js/v7-orders.js'
]
for rel in required:
    path = ROOT / rel
    require(path.is_file() and path.stat().st_size > 0, f'Archivo requerido ausente o vacío: {rel}')

html = (ROOT / 'index.html').read_text(encoding='utf-8')
version_data = json.loads((ROOT / 'app-version.json').read_text(encoding='utf-8'))
manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
shell = (ROOT / 'js/v7-shell.js').read_text(encoding='utf-8')
sync = (ROOT / 'js/supabase-sync.js').read_text(encoding='utf-8')
groups = (ROOT / 'js/pricegroups.js').read_text(encoding='utf-8')
sales = (ROOT / 'js/sales.js').read_text(encoding='utf-8')
clients = (ROOT / 'js/clients.js').read_text(encoding='utf-8')
orders = (ROOT / 'js/v7-orders.js').read_text(encoding='utf-8')
distribution = (ROOT / 'js/v7-distribution.js').read_text(encoding='utf-8')
css = (ROOT / 'css/v7.css').read_text(encoding='utf-8')
update = (ROOT / 'js/app-update.js').read_text(encoding='utf-8')
service_worker = (ROOT / 'service-worker.js').read_text(encoding='utf-8')

require(html.lstrip().lower().startswith('<!doctype html>'), 'index.html debe comenzar con <!DOCTYPE html>')
require('-- NATURA VIDA' not in html and 'create table' not in html.lower() and 'create policy' not in html.lower(), 'index.html contiene texto SQL')
require(version_data.get('version') == '7.6.0', 'app-version.json no indica V7.6.0')
require('V7.6' in manifest.get('name', ''), 'manifest no indica V7.6')
require('v7-distribution.js?v=7.6.0' in html, 'index no carga distribución V7.6.0')
require('service-worker.js?v=7.6.0' in update and "CURRENT_VERSION = '7.6.0'" in update, 'actualizador no está sincronizado con V7.6.0')
require('natura-vida-v7-6-0' in service_worker.lower(), 'caché del service worker no está sincronizada con V7.6.0')
require("'grupos'" in shell and 'Mis grupos de precio' in shell, 'representante no tiene Mis grupos de precio en Más')
require('centralPriceGroups' in sync and 'ownRepresentativeGroups' in sync, 'no existe separación entre grupos centrales y propios')
require('(sellerMode() || AppState.settings.priceGroupsEnabled)' in sales, 'ventas del representante dependen indebidamente del ajuste central')
require('window.isReseller && isReseller()' in clients, 'clientes del representante no permiten grupos propios')
require('tu precio local de venta' in groups and 'representative_local' in groups, 'grupos propios no están explicados o etiquetados correctamente')
require('AppState.centralPriceGroups' in orders, 'pedidos al administrador no usan los grupos centrales separados')
require("'distribucion'" in shell and 'v7MoreDistribution' in shell, 'Distribución y rutas no está habilitada en Más')
for term in ['delivery_routes', 'route_stops', 'deliveries', 'geo_events', 'within_geofence', 'payment-assets']:
    require(term in distribution, f'Falta componente de distribución: {term}')
require('linear-gradient(135deg,#043d25' in css and 'transform:translateY(-4px)' in css, 'no se detecta el rediseño visible de la barra inferior')

# Todos los recursos locales declarados en index.html deben existir.
for attr in re.findall(r'(?:src|href)="([^"]+)"', html):
    if attr.startswith(('http://', 'https://', 'data:', '#')):
        continue
    rel = attr.split('?', 1)[0].lstrip('./')
    require((ROOT / rel).is_file(), f'Recurso local inexistente: {rel}')

# Sintaxis JavaScript completa.
for file in sorted((ROOT / 'js').glob('*.js')):
    result = subprocess.run(['node', '--check', str(file)], capture_output=True, text=True)
    require(result.returncode == 0, f'Error de sintaxis JavaScript: {file.name}')

passed = sum(1 for condition, _ in checks if condition)
print(f'Auditoría del sitio V7.6.0: {passed}/{len(checks)} controles OK')
if passed != len(checks):
    sys.exit(1)
