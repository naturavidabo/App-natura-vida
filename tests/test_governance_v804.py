from pathlib import Path
root=Path(__file__).resolve().parents[1]
js=(root/'js/v8-governance.js').read_text()
settings=(root/'js/settings.js').read_text()
app=(root/'js/app.js').read_text()
index=(root/'index.html').read_text()
css=(root/'css/v8.css').read_text()
checks={
'governance loaded':'js/v8-governance.js?v=8.2.0' in index,
'duplicate detection':'findClientDuplicates' in js,
'inventory checks':'inventoryIssues' in js,
'system health':'systemHealth' in js,
'read-only backup':'natura-vida-safe-export' in js and 'No sustituye' in js,
'no automatic merge':'No se fusionan automáticamente' in js,
'profile classification':'classifyProfile' in js,
'linked activity count':'activityForUser' in js,
'settings entry':'openGovernanceBtn' in settings,
'user badges':'nv804UserFlags' in app,
'responsive styles':'.nv804Grid' in css and '@media(max-width:420px)' in css,
'updated version':'8.2.0' in (root/'app-version.json').read_text(),
}
failed=[k for k,v in checks.items() if not v]
if failed:
 print('FALLÓ:', ', '.join(failed)); raise SystemExit(1)
print(f'Auditoría saneamiento V8.2.0: {len(checks)}/{len(checks)} controles OK')
