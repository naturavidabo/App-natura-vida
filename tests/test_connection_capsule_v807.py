#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'js/v8-offline-continuity.js').read_text(encoding='utf-8')
css=(ROOT/'css/v8.css').read_text(encoding='utf-8')
index=(ROOT/'index.html').read_text(encoding='utf-8')
app=(ROOT/'js/app.js').read_text(encoding='utf-8')
shell=(ROOT/'js/v7-shell.js').read_text(encoding='utf-8')
checks={
 'usa cápsula de cabecera':"getElementById('cloudStatusBadge')" in js and 'nv807ConnectionCapsule' in js,
 'ubicada en cabecera derecha':'nv771HeaderActions' in index and 'cloudStatusBadge' in index,
 'estados breves':"online: 'En línea'" in js and "offline: 'Sin internet'" in js and "reconnecting: 'Reconectando'" in js,
 'sin mensaje gigante':'Conexión restablecida' not in js and 'La información vuelve a actualizarse en tiempo real' not in js,
 'banner anterior oculto':'.nv805ConnectivityBanner{display:none!important}' in css,
 'tamaño compacto':'#cloudStatusBadge.nv807ConnectionCapsule' in css and 'height:28px' in css and 'max-width:116px' in css,
 'solo punto y texto':'<span aria-hidden="true"></span><b>' in js,
 'abre detalle al tocar':'openContinuityCenter' in js and "badge.addEventListener('click'" in js,
 'otros actualizadores conservan cápsula':'nv807ConnectionCapsule' in app and 'nv807ConnectionCapsule' in shell,
}
failed=[name for name,ok in checks.items() if not ok]
print(f"Cápsula de conexión V8.0.7: {len(checks)-len(failed)}/{len(checks)} controles OK")
if failed:
 for name in failed: print('ERROR:',name)
 sys.exit(1)
