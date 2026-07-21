from pathlib import Path
import json, re, sys
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'app-version.json').read_text())
index=(root/'index.html').read_text()
ai=(root/'js/v8-ai-assistant.js').read_text()
fn=(root/'supabase/functions/nv-ai-assistant/index.ts').read_text()
sql=(root/'supabase/migrations/20260721_v821_ai_engine.sql').read_text()
sw=(root/'service-worker.js').read_text()
files=[p for p in root.rglob('*') if p.is_file()]
checks={
 'version 8.2.1':version.get('version')=='8.2.1',
 'script versioned':'js/v8-ai-assistant.js?v=8.2.1' in index,
 'hybrid engine':'answerWithEngine' in ai and 'businessSnapshot' in ai and 'local-fallback' in ai,
 'PII minimized':'phonesExcluded:true' in ai and 'addressesExcluded:true' in ai and 'emailsExcluded:true' in ai,
 'edge function':fn.count('GEMINI_API_KEY')>=2 and 'central_admin' in fn and 'store: false' in fn,
 'structured output':'response_format' in fn and 'application/json' in fn,
 'quota migration':'nv_consume_ai_request' in sql and 'nv_ai_daily_usage' in sql,
 'audit without prompt':'question_hash' in sql and 'nv_ai_audit' in sql,
 'cache version':"nv-app-shell-v821" in sw,
 'under 100 files':len(files)<100,
}
failed=[k for k,v in checks.items() if not v]
if failed:
 print('FALLOS:',failed,'ARCHIVOS:',len(files)); sys.exit(1)
print(f'Motor IA V8.2.1: {len(checks)}/{len(checks)} controles OK · {len(files)} archivos')
