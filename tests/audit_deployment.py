#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
workflow = ROOT / '.github/workflows/deploy-pages.yml'
text = workflow.read_text(encoding='utf-8') if workflow.exists() else ''
errors = []
checks = 0

def require(condition, message):
    global checks
    checks += 1
    if not condition:
        errors.append(message)

require('actions/checkout@v6' in text, 'checkout no usa versión v6')
require('actions/configure-pages@v6' in text, 'configure-pages no usa versión v6')
require('actions/upload-pages-artifact@v5' in text, 'upload-pages-artifact no usa versión v5')
require('actions/deploy-pages@v5' in text, 'deploy-pages no usa versión v5')
require('tests/audit_site_v800.py' in text, 'workflow no ejecuta auditoría V8.0.0')
require('tests/audit_deployment.py' in text, 'workflow no ejecuta auditoría de despliegue')
require("find js -type f -name '*.js'" in text and 'node --check' in text, 'workflow no valida sintaxis JavaScript')
require('cp index.html manifest.json service-worker.js app-version.json _site/' in text, 'workflow no copia archivos raíz')
require('cp -R css icons img js _site/' in text, 'workflow no copia carpetas del sitio')
require('touch _site/.nojekyll' in text, 'workflow no genera .nojekyll')
require('timeout-minutes: 10' in text and 'timeout-minutes: 15' in text, 'faltan límites de tiempo')
require('cancel-in-progress: true' in text, 'falta cancelación de despliegue anterior')
require('include-hidden-files: true' in text, 'artefacto no incluye archivos ocultos')
require('retention-days: 1' in text, 'artefacto no limita retención')
require((ROOT / 'index.html').read_text(encoding='utf-8').lstrip().startswith('<!DOCTYPE html>'), 'index.html no es HTML válido')
require(not list(ROOT.rglob('*.sql')), 'sitio limpio contiene SQL')

if errors:
    print(f'Auditoría de despliegue V8.0.0: {checks-len(errors)}/{checks} controles OK')
    for error in errors:
        print('ERROR:', error)
    sys.exit(1)
print(f'Auditoría de despliegue V8.0.0: {checks}/{checks} controles OK')
