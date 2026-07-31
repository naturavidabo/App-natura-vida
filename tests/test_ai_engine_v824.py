from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'app-version.json').read_text())
index=(root/'index.html').read_text()
ai=(root/'js/v8-ai-assistant.js').read_text()
finance=(root/'js/v8-financial-accounts.js').read_text()
settlement=(root/'js/v8-seller-settlement.js').read_text()
css=(root/'css/v8.css').read_text()
fn=(root/'supabase/functions/nv-ai-assistant/index.ts').read_text()
sql=(root/'supabase/migrations/20260721_v821_ai_engine.sql').read_text()
settlement_sql=(root/'supabase/migrations/20260730_v825_seller_settlements.sql').read_text()
sw=(root/'service-worker.js').read_text()
offline=(root/'js/v8-offline-continuity.js').read_text()
files=[p for p in root.rglob('*') if p.is_file()]
checks={
 'version 8.2.7':version.get('version')=='8.2.7',
 'scripts versioned':'js/v8-ai-assistant.js?v=8.2.7' in index and 'js/v8-seller-settlement.js?v=8.2.7' in index,
 'hybrid engine':'answerWithEngine' in ai and 'businessSnapshot' in ai and 'local-fallback' in ai,
 'operational drafts':all(x in ai for x in ['create_payment_plan','generate_receipt','seller_settlement','resolveDraftActionV825']),
 'confirmed actions':'openActionReview' in ai and 'Acciones con confirmación' in ai and 'openPaymentPlanFormV820' in ai,
 'conversation sidebar':'nvAiThreadPanelV825' in ai and 'renderThreadPanelV825' in ai and 'Chats' in ai,
 'smart floating assistant':'positionFabSmartV827' in ai and "botSvg('is-fab')" in ai and '.nvAiFab .nvAiBotSvg.is-fab' in css and "botSvg('fab')" not in ai,
 'financial context':'__nv820ActiveAccountContext' in finance and 'Analizar con IA' in finance,
 'payment plans operational':'applyPaymentToPlanV825' in finance and 'Pago mayor / adelanto' in finance and 'Registrar cuota' in finance,
 'seller settlement':all(x in settlement for x in ['cashEventsForSeller','Efectivo por entregar','Cobros digitales','Ventas y cobros del vendedor','schemaReady']),
 'seller migration':'nv_seller_settlements' in settlement_sql and 'nv_payment_verifications' in settlement_sql and "notify pgrst, 'reload schema'" in settlement_sql,
 'mobile containment':'.nvAiWorkspaceV825' in css and '.nv825CashMetrics' in css,
 'PII minimized':'phonesExcluded:true' in ai and 'addressesExcluded:true' in ai and 'emailsExcluded:true' in ai,
 'edge function':fn.count('GEMINI_API_KEY')>=2 and 'central_admin' in fn and 'store: false' in fn and 'console.error' in fn,
 'structured actions':all(x in fn for x in ['draft_action','missing_fields','create_payment_plan','prepare_sale','create_quote','items']),
 'structured retry':'NV_AI_STRUCTURED_RETRY' in fn and 'callGemini(apiKey, prompt, false)' in fn,
 'quota migration':'nv_consume_ai_request' in sql and 'nv_ai_daily_usage' in sql,
 'audit non blocking':'NV_AI_AUDIT_WARNING' in fn and '.rpc("nv_log_ai_event"' in fn,
 'assistant excluded dirty state':'.nvAiPage, [data-nv-no-dirty="true"]' in offline and 'data-nv-no-dirty="true"' in ai,
 'cache version':"nv-app-shell-v827" in sw and 'v8-seller-settlement.js' in sw,
 'payment selector':all(x in (root/'js/sales.js').read_text() for x in ['openPaymentMethodSelectorV826','QR / transferencia','paymentVerificationStatus']),
 'receipt without qr':'qrSource' not in (root/'js/v7-documents.js').read_text() and 'FORMA DE PAGO' in (root/'js/v7-documents.js').read_text(),
 'speech only no live voice':'speechSynthesis' in ai and 'SpeechSynthesisUtterance' in ai and 'getUserMedia' not in ai and 'Gemini Live' not in ai,
 'editable secretary actions':all(x in ai for x in ['Rechazar','Editar','Aprobar y continuar','applyEditedActionV826','Trabajos del asistente']),
 'manual price orange only':all(x in (root/'js/sales.js').read_text() for x in ['v826ManualPriceField','v826NeutralField','v826CalculatedPrice']),
 'sale and quote secretary':all(x in ai for x in ['prepare_sale','create_quote','extractQuantityV827']) and 'prepareSaleDraftV827' in (root/'js/sales.js').read_text() and 'prefill.items' in (root/'js/quotes.js').read_text(),
 'under 100 files':len(files)<=100,
}
failed=[k for k,v in checks.items() if not v]
if failed:
 print('FALLOS:',failed,'ARCHIVOS:',len(files)); sys.exit(1)
print(f'Motor IA y caja V8.2.7: {len(checks)}/{len(checks)} controles OK · {len(files)} archivos')
