from pathlib import Path
import sys, json
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
index=(root/'index.html').read_text()
js=(root/'js/v8-offline-continuity.js').read_text()
sw=(root/'service-worker.js').read_text()
settings=(root/'js/settings.js').read_text()
version=json.loads((root/'app-version.json').read_text())
checks={
 'version 8.1.1':version.get('version')=='8.1.1',
 'module loaded':'js/v8-offline-continuity.js?v=8.1.1' in index,
 'app shell cache':"APP_CACHE = 'nv-app-shell-v811'" in sw and 'APP_SHELL' in sw,
 'navigation fallback':"cache.match('./index.html'" in sw,
 'no offline queue':'No existe cola offline' in js and 'no se envía automáticamente' in js,
 'compact status capsule':'cloudStatusBadge' in js and 'nv807ConnectionCapsule' in js,
 'safe draft':'nv805:safe-draft' in js and 'applyDraftToVisibleForm' in js,
 'mutation guard':'blockOfflineMutation' in js,
 'realtime reconnect':'startRealtimeSubscriptions' in js and 'syncAfterLogin' in js,
 'settings center':'openOfflineContinuityBtn' in settings and 'openOfflineContinuityCenterV805' in settings,
 'last sync':'nv805:last-successful-sync' in js,
 'readonly snapshot':'nv805:readonly-snapshot' in js,
}
failed=[k for k,v in checks.items() if not v]
print(f"Continuidad segura V8.1.1: {len(checks)-len(failed)}/{len(checks)} controles OK")
if failed:
    print('\n'.join('FALLÓ: '+x for x in failed)); sys.exit(1)
