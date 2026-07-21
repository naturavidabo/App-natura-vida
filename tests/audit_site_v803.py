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
    checks += 1
    if not condition: errors.append(message)

index=read('index.html'); sw=read('service-worker.js'); update=read('js/app-update.js')
auth=read('js/auth.js'); app=read('js/app.js'); sync=read('js/supabase-sync.js')
territory=read('js/v8-territory.js'); linked=read('js/v8-linked-stock.js'); stability=read('js/v8-stability.js')
roles=read('js/v8-roles.js'); inv=read('js/v7-inventory-sales.js'); css=read('css/v8.css')
shell=read('js/v7-shell.js'); center=read('js/v7-management-center.js'); clients=read('js/clients.js')
sales=read('js/sales.js'); docs=read('js/v7-documents.js')
version=json.loads(read('app-version.json')); manifest=json.loads(read('manifest.json'))

# Paquete y despliegue
require(index.lstrip().startswith('<!DOCTYPE html>'),'index.html no inicia como HTML')
require(version.get('version')=='8.2.0','app-version no indica 8.1.2')
require("CURRENT_VERSION = '8.2.0'" in update,'app-update no indica 8.1.2')
require('service-worker.js?v=8.2.0' in update,'registro del service worker no usa 8.1.2')
require('natura-vida-v8-2-0' in sw.lower(),'service worker no corresponde a V8.2.0')
require('V8.2.0' in manifest.get('name',''),'manifest no identifica V8.2.0')
require('css/v8.css?v=8.2.0' in index,'index no carga CSS V8.2.0')
for script in ['clients.js','sales.js','v7-documents.js','v7-management-center.js','v8-territory.js','v7-shell.js']:
    require(f'js/{script}?v=8.2.0' in index,f'index no carga {script} con versión correcta')
require(index.index('clients.js') < index.index('sales.js'),'clientes debe cargarse antes de ventas')
require(index.index('v8-stability.js') < index.index('v7-commercial-center.js'),'estabilidad se carga después de módulos comerciales')

# Base V8.0.1 conservada
require('persistSession: true' in sync and 'autoRefreshToken: true' in sync,'Supabase no conserva/renueva sesión')
require('getOnlineSessionProfile' in sync and 'readCachedOnlineProfileV801' in sync,'falta recuperación degradada del perfil')
require('renderEmailConfirmationScreenV801' in app and 'Abrir Gmail' in app,'falta confirmación de correo persistente')
require("field_seller" in auth and 'Vendedor vinculado' in auth,'rol vendedor vinculado ausente')
require('inventory:delegated_read' in auth and 'restock:request' in auth,'permisos delegados incompletos')
require('nv801_register_linked_sale_atomic' in sync,'venta vinculada no usa transacción atómica')
require('Inventario delegado · solo lectura' in inv,'inventario delegado no está identificado')
require('saleVisibleToCurrentBusinessV801' in stability and 'businessSalesV801' in stability,'visibilidad comercial incompleta')
require('nv801PatchCurrentView' in stability and 'window.nv801PatchCurrentView' in sync,'actualización silenciosa incompleta')

# Inicio premium
for token in ['v802ExecutiveHero','v802RoleBadge','v802KpiCard','v802StatusStrip','v802ActivityRow','v802LiveChip']:
    require(token in shell,f'Inicio no incorpora {token}')
require('.v802ExecutiveHero' in css and '.v802KpiCard' in css and '.v802ActivityPanel' in css,'faltan estilos premium de Inicio')
require('En tiempo real' in shell and 'Movimientos, consultas y eventos del sistema' in shell,'actividad reciente no tiene contexto moderno')

# Pantalla Más
require('categoryArtV802' in center,'faltan ilustraciones modernas de módulos')
for token in ['v802CategoryCard','v802CategoryArt','v802CategoryCopy']:
    require(token in center and f'.{token}' in css,f'falta estructura/estilo {token}')
require('Ver funciones' in center,'las fichas no tienen llamada a la acción')
require('v802CategoryCard lime' in center or 'v802CategoryCard ${esc(category.tone)}' in center,'Territorio no conserva tarjeta destacada')

# Territorio operativo
require('tile.openstreetmap.org' in territory and 'basemaps.cartocdn.com' in territory,'faltan proveedores cartográficos')
require('nominatim.openstreetmap.org/search' in territory,'falta búsqueda externa de direcciones')
require('localMapResultsV802' in territory and 'AppState.clients' in territory,'falta búsqueda interna de clientes')
require('mapAddressSearchV801' in territory and 'v802MapResult' in territory,'faltan sugerencias territoriales')
require('mapLayersV802' in territory and 'v802MapLayerMenu' in territory,'faltan controles compactos de capas')
require("densitySource: 'all'" in territory and 'densityPointsV802' in territory,'densidad no permite fuentes diferenciadas')
require('L.circle(' in territory and 'Densidad baja–alta' in territory,'densidad no genera capa visual/leyenda')
require('Mi ubicación' in territory and 'Marcar punto' in territory,'faltan acciones territoriales principales')
require('Permiso de ubicación denegado' in territory and 'El GPS no pudo determinar' in territory,'geolocalización no diferencia errores')
require('saveMapViewV801' in territory and 'markerSignature' in territory,'mapa no conserva contexto')
require('.v802MapActions' in css and '.v802MapLayerMenu' in css and '.v802MapResult' in css,'faltan estilos territoriales V8.0.4')
require('.v802MapSearchActive .v800TerritoryMap' in css,'teclado/búsqueda no adapta el mapa')
require('MAP_HOSTS' in sw and "cache: 'no-store'" in sw,'service worker puede conservar cartografía defectuosa')

# Autocompletado y duplicados
for token in ['clientSimilarityScoreV802','clientSuggestionsV802','findLikelyDuplicateClientV802','bindClientAutocompleteV802']:
    require(token in clients,f'falta {token}')
require('clientFormSuggestionsV802' in clients,'formulario de cliente no muestra sugerencias')
require('ckClientSuggestionsV802' in sales,'venta central no muestra sugerencias de clientes')
require('v7ClientSuggestionsV802' in inv,'venta vinculada no muestra sugerencias de clientes')
require('usar el cliente existente' in clients and 'evitar duplicarlo' in sales and 'evitar duplicarlo' in inv,'falta confirmación de duplicados')
require('.clientSuggestionsV802' in css and '.clientSuggestionItemV802' in css,'faltan estilos de autocompletado')

# Edición de precios
require('v802EditablePriceGrid' in sales and 'v802EditableField' in sales,'editor de precios no identifica campos editables')
require('v802PriceEditable' in sales and 'v802PriceEditable' in inv,'listas de venta no marcan visualmente el precio editable')
require('.v802EditableField' in css and '.v802PriceEditable' in css and '--nv802-orange' in css,'falta lenguaje naranja de edición')

# Recibo
require('const qrSize = 210' in docs,'QR no fue ampliado')
require("ctx.imageSmoothingEnabled = false" in docs,'QR no protege nitidez')
require("ctx.fillText('QR de pago'" in docs,'etiqueta QR no fue unificada')
require('Escanee el código QR para realizar el pago.' in docs,'mensaje de pago no fue corregido')
require('Gracias por confiar en Natura Vida Bolivia.' in docs,'falta cierre único de marca')
require('próximos pagos o consultas' not in docs and 'QR de cobro' not in docs,'quedan mensajes redundantes o incorrectos en el recibo')

# Corrección V8.0.7: capas y registro territorial vinculado
require('closeLayersV804' in territory and 'Continuar' in territory,'panel de capas no tiene cierre explícito')
require('prepareTerritorySheetV804' in territory,'formularios territoriales no limpian controles del mapa')
require('tpClientSuggestionsV804' in territory and 'bindClientAutocompleteV802' in territory,'registro territorial no conecta autocompletado de clientes')
require('Cliente existente vinculado' in territory and 'Actualizar cliente y ubicación' in territory,'falta modo de cliente vinculado')
require('await saveClientV723(updated)' in territory,'cliente seleccionado no se actualiza en su ficha')
require("if(result.kind==='client')" in territory and 'clientId:result.id' in territory,'cliente sin GPS no abre formulario de ubicación')
require('.overlay{z-index:7000!important}' in css,'hoja de formulario no queda sobre controles del mapa')
require('.v803LayerFooter' in css and '.v803LinkedClient' in css,'faltan estilos del cierre y cliente vinculado')
require("rawLat===null" in territory and "!(lat===0&&lng===0)" in territory,'validación GPS acepta coordenadas vacías')

# Higiene y compatibilidad
require(all('supabase' in p.relative_to(ROOT).parts for p in ROOT.rglob('*.sql')),'los SQL deben estar únicamente en supabase/')
require(not list(ROOT.rglob('*.bak')),'el paquete contiene respaldos .bak')
require((ROOT/'.nojekyll').exists(),'falta .nojekyll')
require((ROOT/'.node-version').read_text().strip()=='24','Node no está fijado en 24')
require(css.count('{') == css.count('}'),'CSS V8 tiene llaves desbalanceadas')
for match in re.findall(r'(?:src|href)="((?:css|js|icons|img)/[^"?]+)', index):
    require((ROOT/match).exists(),f'recurso local inexistente: {match}')

if errors:
    print(f'Auditoría Natura Vida V8.2.0: {checks-len(errors)}/{checks} controles OK')
    for e in errors: print('ERROR:',e)
    sys.exit(1)
print(f'Auditoría Natura Vida V8.2.0: {checks}/{checks} controles OK')
