#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []
checks = 0

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def require(condition, message):
    global checks
    checks += 1
    if not condition:
        errors.append(message)

index = read('index.html')
manifest = json.loads(read('manifest.json'))
version = json.loads(read('app-version.json'))
sw = read('service-worker.js')
update = read('js/app-update.js')
auth = read('js/auth.js')
core = read('js/v8-core.js')
roles = read('js/v8-roles.js')
territory = read('js/v8-territory.js')
center = read('js/v7-management-center.js')
shell = read('js/v7-shell.js')
orders = read('js/v7-orders.js')
sync = read('js/supabase-sync.js')
css = read('css/v8.css') + '\n' + read('css/v7.css')

require(index.lstrip().startswith('<!DOCTYPE html>'), 'index.html no comienza con DOCTYPE')
require(version.get('version') == '8.0.0', 'app-version.json no indica 8.0.0')
require("CURRENT_VERSION = '8.0.0'" in update, 'app-update.js no indica 8.0.0')
require('service-worker.js?v=8.0.0' in update, 'service worker no se registra con 8.0.0')
require('natura-vida-v8-0-0' in sw.lower(), 'caché del service worker no corresponde a V8.0.0')
require('V8.0.0' in manifest.get('name','') or 'V8.0.0' in manifest.get('description',''), 'manifest no identifica V8.0.0')
require('Te cuida por dentro y por fuera' in index, 'eslogan superior incompleto')
require('css/v8.css?v=8.0.0' in index, 'index no carga estilos V8')
require('js/v8-core.js?v=8.0.0' in index, 'index no carga núcleo V8')
require('js/v8-roles.js?v=8.0.0' in index, 'index no carga roles V8')
require('js/v8-territory.js?v=8.0.0' in index, 'index no carga territorio V8')
require(index.index('js/auth.js') < index.index('js/v8-core.js') < index.index('js/v8-roles.js'), 'orden de carga del núcleo y roles es incorrecto')
require(index.index('js/v8-territory.js') < index.index('js/v7-shell.js'), 'Territorio debe cargarse antes del shell')

for role_code in ['central_admin','regional_admin','regional_advanced','commercial_representative','field_seller','delivery','production','inventory','finance','support']:
    require(role_code in auth, f'falta rol {role_code} en autenticación')
require("regional_advanced" in auth and 'sales:create' in auth and 'workforce:manage' in auth, 'Representante regional avanzado no reúne ventas y equipo')
require('roleSummaryCardV800' in core and 'Proveedor asignado' in core, 'falta resumen de función, región y proveedor')
require('nv800_assign_user_role' in roles, 'interfaz no usa RPC de asignación de roles')
require('El cambio no crea otra cuenta' in roles, 'interfaz no aclara conservación del historial')
require('supplierOptionsV800' in roles and 'Administración / stock central' in roles, 'falta proveedor estructurado y seguro')
require('roles-estructura' in shell and 'renderRolesStructureV800' in shell, 'shell no abre Roles y estructura')

require("title: 'Catálogo comercial'" in center, 'Catálogo no está visible como herramienta comercial')
require("id: 'territorio'" in center and "category: 'territorio'" in center, 'Centro de gestión no separa Territorio')
require("id: 'roles-estructura'" in center, 'Centro de gestión no expone Roles y estructura')
require("tone: 'lime'" in center, 'Territorio no usa identidad verde/lima')
require('v800ModuleHero' in css and 'linear-gradient' in css and 'v800Orb' in css, 'faltan degradados y formas orgánicas V8')

for token in ['territory_prospects','territory_visits','territory_events']:
    require(token in territory or token in sync, f'falta integración de {token}')
require('Capturar ubicación actual' in territory or 'Capturando GPS' in territory, 'Territorio no permite capturar GPS')
require('convertProspectV800' in territory, 'no existe conversión de prospecto en cliente')
require('densityGroups' in territory and 'Mapa territorial' in territory, 'falta visualización territorial por densidad')
require('handleTerritoryRealtimeV800' in territory and 'patchTerritoryV800' in territory, 'Realtime territorial no usa actualización silenciosa')
require("setTimeout(async()=>" in territory and '520' in territory, 'eventos Realtime no se agrupan')
require("main.innerHTML = fullHtml()" in territory or 'main.innerHTML=fullHtml()' in territory, 'falta render inicial territorial')
require('innerHTML=contentHtml()' in territory.replace(' ',''), 'actualización territorial no parchea solo contenido')

require('assignedSupplierNameV800' in orders, 'pedidos no muestran proveedor asignado')
require('supplierUserId' in orders and 'regionalManagerUserId' in orders, 'pedido no transporta contexto de proveedor y responsable')
require('supplier_user_id' in sync and 'regional_manager_user_id' in sync, 'sincronización no conserva contexto regional del pedido')
require('Compra a ${escapeHtml(order.supplierName' in orders, 'historial de pedidos no identifica proveedor')

require(not list(ROOT.rglob('*.sql')), 'el sitio limpio contiene archivos SQL')
require(not any(path.name.startswith('INFORME_TECNICO_V7') or path.name.startswith('README_SUBIDA_V7') for path in ROOT.iterdir()), 'quedaron documentos visibles de la versión anterior')

# Todos los scripts referenciados localmente deben existir.
for src in re.findall(r'<script src="(js/[^"?]+)', index):
    require((ROOT / src).is_file(), f'falta script referenciado: {src}')
for href in re.findall(r'<link rel="stylesheet" href="(css/[^"?]+)', index):
    require((ROOT / href).is_file(), f'falta hoja de estilo: {href}')

if errors:
    print(f'Auditoría V8.0.0: {checks-len(errors)}/{checks} controles OK')
    for error in errors:
        print('ERROR:', error)
    sys.exit(1)
print(f'Auditoría V8.0.0: {checks}/{checks} controles OK')
