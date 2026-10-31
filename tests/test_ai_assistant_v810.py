# Compatibilidad histórica: la implementación vigente es V8.2.0.
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
js=(root/'js/v8-ai-assistant.js').read_text(encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8')
bridge=(root/'js/v9-ai-bridge.js').read_text(encoding='utf-8')
version=json.loads((root/'app-version.json').read_text())
checks={
 'carga diferida':f'v9-ai-bridge.js?v={version["version"]}' in html and 'AI_ASSET_VERSION_V9' in bridge and 'js/v8-ai-assistant.js?v=' in bridge,
 'solo administrador':'adminAllowed' in js and 'isAdmin()' in js,
 'fab flotante':'nvAiFab' in js,
 'panel rápido':'nvAiSheet' in js,
 'pantalla completa':'renderAssistant' in js,
 'análisis ventas':'salesStats' in js,
 'clientes':'clientStats' in js,
 'inventario':'stockStats' in js,
 'persistencia':'readConversation' in js and 'writeConversation' in js,
 'sin ejecución automática':'Nada se guarda automáticamente' in js and 'Aprobar y continuar' in js and 'Rechazar' in js,
}
for k,v in checks.items(): print(('OK' if v else 'FAIL'),k)
assert all(checks.values())
