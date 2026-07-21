from pathlib import Path
root=Path(__file__).resolve().parents[1]
ai=(root/'js/v8-ai-assistant.js').read_text()
css=(root/'css/v8.css').read_text()
checks={
 'recommendations engine':'function recommendations()' in ai,
 'receivables analysis':'function receivableStats()' in ai,
 'discount simulation':'function discountSimulation' in ai,
 'contextual product matching':'function productByQuestion' in ai,
 'recommendations panel':'nvAiRecommendations' in ai,
 'topic shortcuts':'nvAiTopicTabs' in ai,
 'no automatic write':'Ninguna acción se ejecuta automáticamente' in ai,
 'recommendation styles':'.nvAiRecPanel' in css,
}
failed=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(('OK ' if v else 'FAIL ')+k)
if failed: raise SystemExit(1)
print(f'Asistente analítico V8.2.1: {len(checks)}/{len(checks)} controles OK')
