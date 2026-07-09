#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github' / 'workflows' / 'deploy-pages.yml'
failures = []
passes = []

def check(condition, label):
    (passes if condition else failures).append(label)

check(WORKFLOW.is_file(), 'Existe workflow personalizado de GitHub Pages')
text = WORKFLOW.read_text(encoding='utf-8') if WORKFLOW.is_file() else ''

for needle, label in [
    ('actions/checkout@v6', 'Checkout actualizado'),
    ('actions/configure-pages@v6', 'Configure Pages usa Node 24'),
    ('actions/upload-pages-artifact@v5', 'Upload Pages actualizado'),
    ('actions/deploy-pages@v5', 'Deploy Pages usa Node 24'),
    ('cancel-in-progress: true', 'Despliegues antiguos se cancelan automáticamente'),
    ('workflow_dispatch:', 'Permite ejecución manual'),
    ('pages: write', 'Permiso Pages presente'),
    ('id-token: write', 'Permiso OIDC presente'),
    ('path: _site', 'Solo se publica la carpeta estática limpia'),
]:
    check(needle in text, label)

check(not re.search(r'actions/(deploy-pages|configure-pages)@v[1-4]\b', text), 'No quedan acciones Pages antiguas')
check((ROOT / '.nojekyll').is_file(), 'Existe .nojekyll en la raíz')

required = ['index.html', 'manifest.json', 'service-worker.js', 'app-version.json']
for item in required:
    check((ROOT / item).is_file(), f'Existe {item}')

print(f'PASS={len(passes)} FAIL={len(failures)}')
for label in failures:
    print('FAIL:', label)
if failures:
    sys.exit(1)
print('Auditoría de despliegue completada sin fallos.')
