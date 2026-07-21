from pathlib import Path
import json, sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
index=(root/'index.html').read_text(encoding='utf-8')
js=(root/'js/v8-quality-assurance.js').read_text(encoding='utf-8')
settings=(root/'js/settings.js').read_text(encoding='utf-8')
css=(root/'css/v8.css').read_text(encoding='utf-8')
sw=(root/'service-worker.js').read_text(encoding='utf-8')
version=json.loads((root/'app-version.json').read_text(encoding='utf-8'))
checks={
 'version 8.1.2':version.get('version')=='8.1.2',
 'module loaded':'js/v8-quality-assurance.js?v=8.1.2' in index,
 'module cached':"'./js/v8-quality-assurance.js'" in sw,
 'verified backup schema':'natura-vida-verified-backup' in js,
 'sha256 integrity':'SHA-256' in js and 'payloadHash' in js,
 'backup validation':'validateBackupFile' in js and 'compareBackupWithCurrent' in js,
 'no browser restore':'Restauración real bloqueada en el navegador' in js,
 'audit viewer':'fetchAuditRows' in js and "from('audit_log')" in js,
 'audit export':'exportAuditCsv' in js,
 'client quality':'inspectClients' in js and 'client_duplicate_phone' in js,
 'product quality':'inspectProducts' in js and 'product_price_below_cost' in js,
 'sales quality':'inspectSales' in js and 'sale_probable_duplicate' in js,
 'inventory sequence':'inspectInventory' in js and 'movement_sequence_gap' in js,
 'demo user blocking':'blockDemoProfile' in js and 'adminBlockUser' in js,
 'settings access':'openQualityControlV806Btn' in settings,
 'responsive styles':'.nv806Metrics' in css and '@media(max-width:640px)' in css,
}
failed=[name for name,ok in checks.items() if not ok]
print(f"Control administrativo V8.1.2: {len(checks)-len(failed)}/{len(checks)} controles OK")
if failed:
    for name in failed: print('ERROR:',name)
    sys.exit(1)
