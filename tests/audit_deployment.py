#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
workflow=ROOT/'.github/workflows/deploy-pages.yml'
text=workflow.read_text(encoding='utf-8') if workflow.exists() else ''
errors=[];checks=0
def require(c,m):
 global checks; checks+=1
 if not c: errors.append(m)
require('actions/checkout@v6' in text,'checkout no usa v6')
require('actions/configure-pages@v6' in text,'configure-pages no usa v6')
require('actions/upload-pages-artifact@v5' in text,'upload-pages-artifact no usa v5')
require('actions/deploy-pages@v5' in text,'deploy-pages no usa v5')
require('tests/audit_site_v803.py' in text,'workflow no ejecuta auditoría V8.0.4')
require('tests/audit_deployment.py' in text,'workflow no ejecuta auditoría de despliegue')
require('node tests/test_client_autocomplete_v803.js' in text,'workflow no prueba autocompletado de clientes')
require('tests/test_governance_v804.py' in text,'workflow no prueba saneamiento')
require('tests/test_offline_continuity_v805.py' in text,'workflow no prueba continuidad offline')
require('tests/test_quality_assurance_v806.py' in text and 'test_quality_core_v806.js' in text,'workflow no prueba calidad V8.0.6')
require('tests/test_territory_registration_v803.py' in text,'workflow no prueba regresión territorial')
require("find js -type f -name '*.js'" in text and 'node --check' in text,'workflow no valida JavaScript')
require('cp index.html manifest.json service-worker.js app-version.json _site/' in text,'workflow no copia raíz')
require('cp -R css icons img js _site/' in text,'workflow no copia carpetas')
require('touch _site/.nojekyll' in text,'workflow no genera .nojekyll')
require('timeout-minutes: 10' in text and 'timeout-minutes: 15' in text,'faltan timeouts')
require('cancel-in-progress: true' in text,'falta cancelación concurrente')
require('include-hidden-files: true' in text,'no incluye ocultos')
require('retention-days: 1' in text,'retención del artefacto no está limitada')
require((ROOT/'index.html').read_text(encoding='utf-8').lstrip().startswith('<!DOCTYPE html>'),'index inválido')
require(not list(ROOT.rglob('*.sql')),'sitio contiene SQL')
if errors:
 print(f'Auditoría de despliegue V8.0.6: {checks-len(errors)}/{checks} controles OK')
 for e in errors: print('ERROR:',e)
 sys.exit(1)
print(f'Auditoría de despliegue V8.0.6: {checks}/{checks} controles OK')
