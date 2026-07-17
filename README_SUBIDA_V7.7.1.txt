NATURA VIDA V7.7.1 — ESTABILIZACIÓN E INTEGRACIÓN OPERATIVA
============================================================

Este paquete contiene únicamente el sitio web/PWA para GitHub Pages.
NO contiene archivos SQL.

ANTES DE PUBLICAR
-----------------
1. En Supabase SQL Editor ejecuta:
   01_V7.7.1_ESTABILIZACION_INTEGRACION_OPERATIVA.sql
2. Cuando termine con Success, ejecuta:
   02_V7.7.1_VERIFICAR.sql
3. Revisa que todos los controles muestren OK.

SUBIDA A GITHUB
---------------
1. Extrae el ZIP del sitio web en tu computadora.
2. En el repositorio pulsa Add file > Upload files.
3. Arrastra TODO el contenido extraído, no el archivo ZIP.
4. Acepta reemplazar los archivos que tengan el mismo nombre.
5. Conserva las carpetas y verifica que index.html quede en la raíz.
6. Confirma el commit y espera que Actions termine en verde.

No es necesario borrar previamente todo el repositorio si el sitio ya está limpio.
La subida completa reemplaza los archivos principales. Si existen archivos viejos
que ya no pertenecen a la aplicación, elimínalos para evitar residuos.

ESTRUCTURA ESPERADA EN LA RAÍZ
------------------------------
.github/
css/
icons/
img/
js/
tests/
index.html
manifest.json
service-worker.js
app-version.json
.nojekyll
.node-version

COMPROBACIÓN RÁPIDA
-------------------
- index.html debe comenzar con: <!DOCTYPE html>
- app-version.json debe indicar: 7.7.1
- No debe existir ningún archivo .sql dentro del repositorio web.
- GitHub Actions debe ejecutar audit_site_v771.py y audit_deployment.py.

PRUEBAS RECOMENDADAS DESPUÉS DE PUBLICAR
----------------------------------------
1. Ingresar como administrador y como representante.
2. Subir una fotografía de perfil y confirmar que aparezca en la cabecera.
3. Registrar una venta con “Requiere entrega”.
4. Abrir Distribución y comprobar que aparece en Entregas pendientes.
5. Crear una ruta desde la entrega y confirmar el origen de la venta/pedido.
6. Revisar Gestión regional y Representantes: no deben reemplazar valores por
   “Cargando…” durante Realtime.
7. Registrar personal con cuenta, sin cuenta y un ayudante ocasional.
8. Probar GPS, foto de evidencia y geocerca con un teléfono real.

Esta actualización no elimina ventas, stock, clientes, rutas ni personal histórico.
