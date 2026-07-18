#!/usr/bin/env python3
from pathlib import Path
import json, re, sys

ROOT = Path(__file__).resolve().parents[1]
errors=[]; checks=0

def read(rel):
    p=ROOT/rel
    return p.read_text(encoding='utf-8') if p.exists() else ''

def require(condition,message):
    global checks
    checks+=1
    if not condition: errors.append(message)

index=read('index.html'); sw=read('service-worker.js'); update=read('js/app-update.js')
auth=read('js/auth.js'); app=read('js/app.js'); sync=read('js/supabase-sync.js')
territory=read('js/v8-territory.js'); linked=read('js/v8-linked-stock.js'); stability=read('js/v8-stability.js')
roles=read('js/v8-roles.js'); inv=read('js/v7-inventory-sales.js'); css=read('css/v8.css')
version=json.loads(read('app-version.json')); manifest=json.loads(read('manifest.json'))

require(index.lstrip().startswith('<!DOCTYPE html>'),'index.html no inicia como HTML')
require(version.get('version')=='8.0.1','app-version no indica 8.0.1')
require("CURRENT_VERSION = '8.0.1'" in update,'app-update no indica 8.0.1')
require('service-worker.js?v=8.0.1' in update,'registro del service worker no usa 8.0.1')
require('natura-vida-v8-0-1' in sw.lower(),'service worker no corresponde a V8.0.1')
require('V8.0.1' in manifest.get('name',''),'manifest no identifica V8.0.1')
require('css/v8.css?v=8.0.1' in index,'index no carga CSS V8.0.1')
for script in ['v8-core.js','v8-linked-stock.js','v8-stability.js','v8-roles.js','v8-territory.js','v7-shell.js']:
    require(f'js/{script}?v=8.0.1' in index,f'index no carga {script} con versión correcta')
require(index.index('v8-stability.js') < index.index('v7-commercial-center.js'),'estabilidad se carga después de módulos comerciales')
require('Te cuida por dentro y por fuera' in index and "subtitle.textContent = 'Te cuida por dentro y por fuera'" in app,'eslogan no queda completo y permanente')

# Acceso y confirmación
require('persistSession: true' in sync and 'autoRefreshToken: true' in sync,'Supabase no conserva/renueva sesión')
require('getOnlineSessionProfile' in sync and 'readCachedOnlineProfileV801' in sync,'falta recuperación degradada del perfil')
require("status: 'recovering'" in auth and 'Restaurando tu sesión' in app,'falta pantalla de sesión en reconexión')
require('renderEmailConfirmationScreenV801' in app,'falta pantalla de confirmación de correo')
require('Abrir Gmail' in app,'falta acceso visible a Gmail')
require('resendSignupConfirmation' in sync and 'Reenviar confirmación' in app,'falta reenvío de confirmación')
require('Cambiar correo' in app and 'Ya confirmé' in app,'faltan acciones de confirmación')
require('NV801_PENDING_CONFIRMATION_KEY' in app,'confirmación pendiente no se conserva')

# Vendedor vinculado y stock delegado
require("field_seller" in auth and 'Vendedor vinculado' in auth,'rol vendedor vinculado ausente')
require('inventory:delegated_read' in auth and 'restock:request' in auth,'permisos delegados incompletos')
require('stockOwnerUserId' in auth and 'stockPointId' in auth,'sesión no guarda propietario/punto')
require('nv801_my_sellable_stock' in sync,'stock vendible no se consulta por RPC')
require('nv801_register_linked_sale_atomic' in sync,'venta vinculada no usa transacción atómica')
require('stockOwnerUserId' in inv and 'stockPointId' in inv,'venta no conserva origen del stock')
require('Inventario delegado · solo lectura' in inv,'inventario delegado no está identificado')
require('no modifica precios base ni costos' in inv,'vendedor puede intentar editar costos')
require('Puntos de venta y vendedores' in linked,'falta administración de puntos de venta')
require('Mi stock de trabajo' in linked,'falta vista de stock del vendedor')
require('Solicitar reposición' in linked,'falta solicitud de reposición')
require('nv801_adjust_stock_point' in linked,'movimientos de custodia no usan función segura')
require('nv801_assign_user_role' in roles,'asignación del vendedor no usa RPC V8.0.1')
require('Propietario del stock de trabajo' in roles and 'Punto de venta o custodia' in roles,'asignación de stock no aparece en rol')

# Visibilidad comercial y carga silenciosa
require('saleVisibleToCurrentBusinessV801' in stability,'falta filtro de ventas del negocio')
require('businessSalesV801' in stability,'falta consolidación por propietario de stock')
require('nv801PatchCurrentView' in stability,'falta estabilización transversal')
require('window.nv801PatchCurrentView' in sync,'sincronización no intenta parche localizado')
require('refreshRegionalV771' in stability and 'refreshAndPatchV770' in stability,'faltan parches regional/distribución')
require('refreshLinkedStockV801' in linked,'stock vinculado no tiene actualización silenciosa')
require('Conserva el valor anterior' in read('js/v7-integration-v771.js'),'métricas de representantes pueden volver a Cargando')

# Mapa estable
require('tile.openstreetmap.org' in territory,'falta capa OpenStreetMap')
require('basemaps.cartocdn.com' in territory,'falta proveedor alternativo')
require('tileerror' in territory and 'Cartografía no disponible' in territory,'falta detección de mosaicos fallidos')
require('BOLIVIA_CENTER' in territory and 'BOLIVIA_ZOOM' in territory,'falta vista inicial de Bolivia')
require('navigator.geolocation' in territory and 'Mi ubicación' in territory,'falta ubicación del teléfono')
require('Marcar punto' in territory and "territory.map.on('click'" in territory,'falta selección manual en mapa')
require('nominatim.openstreetmap.org/search' in territory,'falta búsqueda de direcciones')
require('fullscreenMapV801' in territory and 'v801MapFullscreen' in css,'falta mapa a pantalla completa')
require('densityVisible: false' in territory,'densidad debe iniciar desactivada')
require('Math.min(Math.max(accuracy,8),150)' in territory,'círculo GPS no está limitado')
require('markerSignature' in territory and 'saveMapViewV801' in territory,'mapa no conserva vista o recrea marcadores sin control')
require('MAP_HOSTS' in sw and 'tile.openstreetmap.org' in sw and 'cache: \'no-store\'' in sw,'service worker puede cachear mosaicos defectuosos')
require('onerror=' in index and 'cdn.jsdelivr.net/npm/leaflet' in index,'Leaflet no tiene CDN alternativo')
require('.v801MapStatus' in css and '.v801MapSearch' in css,'faltan estilos del mapa estable')

# Identidad visual
require('linear-gradient(112deg' in css and '--nv8-lime' in css,'falta integración verde-lima')
require('.nv771LogoInsignia' in css and '.nv801MailSeal' in css,'insignia o acceso no tienen acabado visual')
require('.v801SellerSource' in css and '.v801PointCard' in css,'stock vinculado sin diseño visual')
require('.bottom{' in css and 'linear-gradient' in css,'barra inferior no conserva degradado')

require(not list(ROOT.rglob('*.sql')),'el sitio para GitHub contiene SQL')
require(not re.search(r'--\s*NATURA VIDA V8\.0\.1.*create table',index,re.I|re.S),'index contiene SQL')
require((ROOT/'.nojekyll').exists(),'falta .nojekyll')
require((ROOT/'.node-version').read_text().strip()=='24','Node no está fijado en 24')

if errors:
    print(f'Auditoría Natura Vida V8.0.1: {checks-len(errors)}/{checks} controles OK')
    for e in errors: print('ERROR:',e)
    sys.exit(1)
print(f'Auditoría Natura Vida V8.0.1: {checks}/{checks} controles OK')
