#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
territory=(ROOT/'js/v8-territory.js').read_text(encoding='utf-8')
css=(ROOT/'css/v8.css').read_text(encoding='utf-8')
checks={
 'botón Continuar del panel de capas': 'id="closeLayersV803">Continuar' in territory,
 'cierre de capas antes del formulario': 'prepareTerritorySheetV803();' in territory,
 'autocompletado dentro del formulario': 'tpClientSuggestionsV803' in territory and 'onSelect:fillFromClient' in territory,
 'llenado de WhatsApp': "$('#tpPhone',overlay).value=client.phone||''" in territory,
 'llenado de ciudad y dirección': "$('#tpCity',overlay).value=client.city||''" in territory and "$('#tpAddress',overlay).value=client.address||''" in territory,
 'llenado de coordenadas': "$('#tpLat',overlay).value=lat" in territory and "$('#tpLng',overlay).value=lng" in territory,
 'actualización sin prospecto duplicado': 'await saveClientV723(updated)' in territory,
 'formulario por encima del mapa': '.overlay{z-index:7000!important}' in css,
 'coordenadas vacías rechazadas': "rawLat===null" in territory and "rawLng===''" in territory,
}
failed=[name for name,ok in checks.items() if not ok]
if failed:
 print(f'Regresión territorial V8.0.3: {len(checks)-len(failed)}/{len(checks)} controles OK')
 for name in failed: print('ERROR:',name)
 sys.exit(1)
print(f'Regresión territorial V8.0.3: {len(checks)}/{len(checks)} controles OK')
