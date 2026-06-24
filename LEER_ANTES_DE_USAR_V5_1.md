# LEER ANTES DE USAR — NATURA VIDA V5.1

Esta versión corrige fallas críticas reportadas en V5.0.

## Qué debes hacer en Supabase

Si ya tienes proyecto Supabase creado, ejecuta este archivo:

SUPABASE_MIGRACION_V5_1_ESTABLE.sql

Ruta:
Supabase > SQL Editor / Editor SQL > New query / Nueva consulta > pegar contenido > Run / Ejecutar.

Este archivo NO borra datos. Completa columnas faltantes si la tabla products fue creada manualmente o quedó incompleta.

## Qué debes subir a GitHub

Sube todo el contenido interno de esta carpeta:
- index.html
- manifest.json
- service-worker.js
- js
- css
- icons
- img
- archivos .sql y .md

## Caché

Después de subir, limpiar caché en celulares:
- Chrome > Configuración del sitio > Borrar datos
- o desinstalar/reinstalar la PWA.

## Prueba mínima

1. Entrar como admin.
2. Crear producto de prueba.
3. Registrar venta.
4. Verificar que se genera recibo.
5. Crear cotización.
6. Presionar Generar imagen.
7. Ejecutar Publicar catálogo.
8. En vendedor, presionar Recibir novedades.

Si el catálogo no publica, revisar el error. Si dice columnas/tabla/política, ejecutar SUPABASE_MIGRACION_V5_1_ESTABLE.sql.
