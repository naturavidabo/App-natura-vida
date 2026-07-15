#!/usr/bin/env python3
from pathlib import Path
import re, sys

ROOT=Path(__file__).resolve().parents[1]
workflow=ROOT/'.github/workflows/deploy-pages.yml'
errors=[]
text=workflow.read_text(encoding='utf-8') if workflow.exists() else ''

def require(cond,msg):
    if not cond: errors.append(msg)

require(workflow.exists(),'Falta workflow de GitHub Pages')
for action in ['actions/checkout@v6','actions/configure-pages@v6','actions/upload-pages-artifact@v5','actions/deploy-pages@v5']:
    require(action in text,f'Acción faltante o desactualizada: {action}')
for item in ['index.html','manifest.json','service-worker.js','app-version.json','css icons img js']:
    require(item in text,f'Empaquetado incompleto: {item}')
require('cancel-in-progress: true' in text,'Falta cancelación de despliegues antiguos')
require('pages: write' in text and 'id-token: write' in text,'Permisos Pages incompletos')
require((ROOT/'.nojekyll').exists(),'Falta .nojekyll')
require((ROOT/'.node-version').read_text().strip().startswith('24'),'Node 24 no configurado')

print(f'Auditoría de despliegue V7.3: {11-len(errors)}/11 controles OK')
if errors:
    for e in errors: print('ERROR:',e)
    sys.exit(1)
