from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'app-version.json').read_text())
index=(root/'index.html').read_text()
ai=(root/'js/v8-ai-assistant.js').read_text()
finance=(root/'js/v8-financial-accounts.js').read_text()
css=(root/'css/v8.css').read_text()
fn=(root/'supabase/functions/nv-ai-assistant/index.ts').read_text()
sql=(root/'supabase/migrations/20260721_v821_ai_engine.sql').read_text()
sw=(root/'service-worker.js').read_text()
offline=(root/'js/v8-offline-continuity.js').read_text()
files=[p for p in root.rglob('*') if p.is_file()]
checks={
 'version 8.2.4':version.get('version')=='8.2.4',
 'script versioned':'js/v8-ai-assistant.js?v=8.2.4' in index,
 'hybrid engine':'answerWithEngine' in ai and 'businessSnapshot' in ai and 'local-fallback' in ai and 'invokeErrorMessageV824' in ai,
 'confirmed actions':'openActionReview' in ai and 'Acciones con confirmación' in ai and 'prepare_collection_message' in ai,
 'organized conversations':'readArchivesV824' in ai and 'showConversationHistoryV824' in ai and 'dedupeEntriesV824' in ai and 'Nueva conversación' in ai,
 'financial context':'__nv820ActiveAccountContext' in finance and 'Analizar con IA' in finance,
 'mobile assistant containment':'.nvAiPage{width:100%;max-width:100%;min-width:0' in css and '.nvAiMessage.assistant .nvAiBubble' in css,
 'mobile account containment':'.nv820AccountActions{display:grid' in css and '.nv820AccountMetrics{width:100%' in css,
 'PII minimized':'phonesExcluded:true' in ai and 'addressesExcluded:true' in ai and 'emailsExcluded:true' in ai,
 'edge function':fn.count('GEMINI_API_KEY')>=2 and 'central_admin' in fn and 'store: false' in fn and 'console.error' in fn,
 'structured output':'response_format' in fn and 'application/json' in fn and 'suggested_actions' in fn and 'temperature' not in fn,
 'quota migration':'nv_consume_ai_request' in sql and 'nv_ai_daily_usage' in sql,
 'audit without prompt':'question_hash' in sql and 'nv_ai_audit' in sql,
 'audit rpc non blocking':'NV_AI_AUDIT_WARNING' in fn and '.rpc("nv_log_ai_event"' in fn and '.catch(() => {})' not in fn,
 'assistant excluded from transactional dirty state':'.nvAiPage, [data-nv-no-dirty="true"]' in offline and 'data-nv-no-dirty="true"' in ai,
 'assistant composer draft':'composerDraftKey' in ai and 'saveComposerDraft' in ai and 'clearComposerDraft' in ai,
 'cache version':"nv-app-shell-v824" in sw,
 'under or equal 100 files':len(files)<=100,
}
failed=[k for k,v in checks.items() if not v]
if failed:
 print('FALLOS:',failed,'ARCHIVOS:',len(files)); sys.exit(1)
print(f'Motor IA V8.2.4: {len(checks)}/{len(checks)} controles OK · {len(files)} archivos')
