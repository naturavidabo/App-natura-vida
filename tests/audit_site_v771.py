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

def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')

index = read('index.html')
version = json.loads(read('app-version.json'))
manifest = json.loads(read('manifest.json'))
update = read('js/app-update.js')
sw = read('service-worker.js')
shell = read('js/v7-shell.js')
management = read('js/v7-management-center.js')
workforce = read('js/v7-workforce.js')
distribution = read('js/v7-distribution.js')
regional = read('js/v7-regional.js')
integration = read('js/v7-integration-v771.js')
sync = read('js/supabase-sync.js')
sales = read('js/sales.js')
orders = read('js/v7-orders.js')
profiles = read('js/v7-profile-users.js')
auth = read('js/auth.js')
v7supabase = read('js/v7-supabase.js')
css = read('css/v7.css')
groups = read('js/pricegroups.js')

# Base/version/package
require(index.lstrip().lower().startswith('<!doctype html>'), 'index.html no comienza con DOCTYPE HTML')
require(version.get('version') == '7.7.1', 'app-version.json no indica V7.7.1')
require(version.get('channel') == 'stable', 'app-version.json no usa canal estable')
require("CURRENT_VERSION = '7.7.1'" in update, 'app-update.js no indica V7.7.1')
require('service-worker.js?v=7.7.1' in update, 'registro del service worker no usa V7.7.1')
require('natura-vida-v7-7-1' in sw.lower(), 'caché del service worker no corresponde a V7.7.1')
require('V7.7.1' in manifest.get('name', ''), 'manifest no corresponde a V7.7.1')
require('v7-integration-v771.js?v=7.7.1' in index, 'index no carga integración V7.7.1')
require(index.index('v7-commercial-center.js') < index.index('v7-integration-v771.js') < index.index('v7-profile-users.js'), 'orden de carga de la integración V7.7.1 es incorrecto')
require(index.index('v7-management-center.js') < index.index('v7-shell.js'), 'Centro de gestión debe cargar antes del shell')
require(not list(ROOT.rglob('*.sql')), 'el paquete del sitio contiene archivos SQL')
require((ROOT / '.nojekyll').exists(), 'falta .nojekyll')
require((ROOT / '.node-version').read_text().strip() == '24', 'Node no está fijado en versión 24')

# Cabecera artística y fotografía
require('Te cuida por dentro y por fuera' in index and 'Te cuida por dentro y por fuera' in shell, 'el eslogan completo no está fijado en la cabecera')
require('nv771LogoInsignia' in index and 'nv771LogoInsignia' in css, 'falta la insignia artística del logotipo')
require('linear-gradient(118deg' in css and '#9bd63f' in css.lower(), 'falta el degradado verde a lima solicitado')
require('topProfileButtonV771' in index and 'topProfileAvatarV771' in index, 'falta el perfil fotográfico permanente en cabecera')
require('uploadMyAvatarV771' in integration and 'removeMyAvatarV771' in integration, 'carga o eliminación de fotografía no implementada')
require("storage.from('profile-assets')" in integration and "nv771_update_my_avatar" in integration, 'fotografía no se integra con Storage y perfil')
require('nv771PhotoPanel' in profiles and 'nv771PhotoPanel' in css, 'falta panel visual para gestionar fotografía')
require('avatarMarkupV771' in profiles and 'avatarMarkupV771' in workforce and 'avatarMarkupV771' in regional, 'fotografía no se utiliza para identificar perfiles, personal y regiones')
require('installInboxButton' in shell, 'la cabecera no conserva la bandeja de mensajes')

# Integración comercial y entregas
require('Requiere entrega' in sales and 'ck_deliveryFieldsV771' in sales, 'venta no ofrece crear entrega pendiente')
require('createDeliveryRequestFromSaleV771' in sales, 'venta no crea solicitud de entrega')
require('ensureDeliveryRequestFromOrderV771' in orders, 'pedido pagado no crea solicitud de entrega')
require("from('delivery_requests')" in integration and 'source_type' in integration, 'integración de entregas no usa delivery_requests')
require('findDeliveryRequestBySourceV771' in integration and "String(error.code || '') === '23505'" in integration, 'no se previenen duplicados de entrega')
require('Entregas pendientes' in distribution and 'planSelectedRequestsV771' in distribution, 'Distribución no tiene bandeja de entregas pendientes')
require('nv771_plan_delivery_requests' in integration, 'no existe planificación de ruta desde entregas seleccionadas')
require('source_code' in distribution and 'source_type' in distribution and 'stop.items' in distribution, 'las paradas no muestran origen y productos')
require('bindDeliveryQueueEventsV771' in distribution and 'button.onclick' in distribution, 'eventos de la bandeja pueden duplicarse')

# Estabilidad Realtime / ausencia de parpadeo
require('regionalLoaded' in regional and "if (!regionalLoaded && !options.quiet)" in regional, 'Gestión regional no limita Cargando a la primera apertura')
require('patchRegionalV771' in regional and 'handleRegionalRealtimeV771' in regional, 'Gestión regional no actualiza silenciosamente')
require('metricCache' in integration and 'nunca vuelve visualmente a “Cargando…”' in integration, 'métricas de representantes no conservan el valor anterior')
require('hydrateRepresentativeCardsV730:hydrateRepresentativeCardsStableV771' in integration, 'no se reemplazó hidratación inestable de representantes')
require('distributionLoaded' in distribution and 'patchRouteDetailV770' in distribution and 'mapSignature' in distribution, 'Distribución no conserva pantalla y mapa')
require('realtimeTimer' in distribution and 'realtimeTimer' in regional and 'realtimeTimer' in workforce, 'eventos Realtime no se agrupan')
require("handleDistributionRealtimeV770(table, payload)" in sync, 'Supabase sigue forzando render general para Distribución')
require("handleRegionalRealtimeV771(table, payload)" in sync, 'Supabase sigue forzando render general para Gestión regional')
require("handleWorkforceRealtimeV770(table, payload)" in sync, 'Supabase sigue forzando render general para Personal')
require("table === 'representative_stock'" in sync and 'hydrateRepresentativeCardsV730' in sync, 'stock de representantes no se actualiza silenciosamente')
require('patchWorkforceV771' in workforce and 'window.scrollY' in workforce and 'workforceTabContentV771' in workforce, 'Personal no tiene parche parcial que conserve contexto')

# Personal con/sin acceso y ocasionales
require('staffAccessModeV771' in workforce and 'linkedUserFieldV771' in workforce, 'Personal no diferencia acceso a la aplicación')
require('operational_role' in workforce and 'linked_user_id' in workforce, 'Personal no guarda rol operativo o cuenta vinculada')
require('Ayudante ocasional / momentáneo' in workforce and 'worker_kind' in workforce, 'mano de obra ocasional no está implementada')
require('El ayudante ocasional no necesita cuenta' in workforce, 'no se explica el registro directo del ayudante ocasional')
require('payment_status' in workforce and 'payment_method' in workforce, 'costo ocasional no registra estado/forma de pago')
require('operationalRole' in auth and 'linkedStaffId' in auth, 'la sesión no prepara rol operativo vinculado')
require("from('staff_members')" in v7supabase and '.limit(1)' in v7supabase, 'no se carga de forma segura la ficha laboral vinculada')

# Centro de gestión y comercial
require('Buscar clientes, rutas, personal, egresos' in management, 'Centro de gestión no incluye buscador')
require("readArray('favorites')" in management and "readArray('recents')" in management, 'Centro de gestión no conserva favoritos y recientes')
require("category: 'administracion'" in management and "category: 'operaciones'" in management, 'Centro de gestión no separa operación y configuración')
require('renderManagementCenterV770' in shell, 'Más no delega al Centro de gestión')
require('salesCatalogV770' in sales and 'openCatalogPdfOptions' in sales, 'Catálogo no está visible en el flujo de Ventas')
require('Mis grupos de precio' in groups and 'representative_local' in groups, 'grupos propios del representante no están habilitados')

# Estética y responsive
require('nv771LimeHero' in css and 'nv771HeaderGlow' in css and 'nv771HeroOrb' in css, 'faltan luces/formas orgánicas V7.7.1')
require('@media(max-width:620px)' in css and '.nv771ProfileText{display:none}' in css, 'cabecera no está adaptada a celular')
require('nv771DeliveryQueue' in css and 'nv771DeliveryRequestCard' in css, 'bandeja de entregas no tiene diseño integrado')

# Sintaxis JavaScript
for js in sorted((ROOT / 'js').glob('*.js')):
    result = subprocess.run(['node', '--check', str(js)], capture_output=True, text=True)
    require(result.returncode == 0, f'Error de sintaxis en {js.name}: {result.stderr.strip()}')

if errors:
    print(f'Auditoría V7.7.1: {checks-len(errors)}/{checks} controles OK')
    for error in errors:
        print('ERROR:', error)
    sys.exit(1)
print(f'Auditoría V7.7.1: {checks}/{checks} controles OK')
