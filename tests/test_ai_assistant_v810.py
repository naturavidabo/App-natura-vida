from pathlib import Path
root=Path(__file__).resolve().parents[1]
js=(root/'js/v8-ai-assistant.js').read_text()
html=(root/'index.html').read_text()
checks={
 'script incluido':'v8-ai-assistant.js?v=8.1.0' in html,
 'solo administrador':'adminAllowed' in js and 'isAdmin()' in js,
 'fab flotante':'nvAiFab' in js,
 'panel rápido':'nvAiSheet' in js,
 'pantalla completa':'renderAssistant' in js,
 'análisis ventas':'salesStats' in js,
 'clientes':'clientStats' in js,
 'inventario':'stockStats' in js,
 'sin ejecución automática':'Ninguna acción se ejecuta sin confirmación' in js,
}
for k,v in checks.items(): print(('OK' if v else 'FAIL'),k)
assert all(checks.values())
