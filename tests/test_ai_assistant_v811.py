from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
js=(root/'js/v8-ai-assistant.js').read_text(encoding='utf-8')
html=(root/'index.html').read_text(encoding='utf-8')
css=(root/'css/v8.css').read_text(encoding='utf-8')
center=(root/'js/v7-management-center.js').read_text(encoding='utf-8')
shell=(root/'js/v7-shell.js').read_text(encoding='utf-8')
sw=(root/'service-worker.js').read_text(encoding='utf-8')
version=json.loads((root/'app-version.json').read_text(encoding='utf-8'))
checks={
 'versión 8.2.0': version.get('version')=='8.2.4',
 'script versionado': 'v8-ai-assistant.js?v=8.2.4' in html,
 'acceso propio en administración': "id: 'asistente-ia'" in center and "category: 'administracion'" in center,
 'navegación robusta': "case 'asistente-ia'" in shell and 'renderAIAssistantV812' in shell,
 'conversación estructurada': 'readConversation' in js and 'writeConversation' in js and "role:'assistant',response" in js,
 'respuesta no se borra al renderizar': 'if(existing && !options.force)' in js and 'renderConversation(false)' in js,
 'panel rápido continúa conversación': 'Continuar conversación' in js and 'Abrir asistente completo' in js,
 'bot mejorado': 'nvAiBotSvg' in js and '.nvAiBotSvg' in css,
 'motor local sin acciones automáticas': 'Ninguna acción se ejecuta sin confirmación' in js,
 'asistente incluido en caché': "'./js/v8-ai-assistant.js'" in sw,
 'caché V812': "nv-app-shell-v824" in sw,
 'css balanceado': css.count('{')==css.count('}'),
}
for k,v in checks.items(): print(('OK' if v else 'FAIL'),k)
assert all(checks.values())
