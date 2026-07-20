# Informe técnico — Natura Vida V8.0.6

**Nombre:** Respaldo, auditoría y calidad de datos  
**Base:** Natura Vida V8.0.5  
**Persistencia oficial:** Supabase PostgreSQL  
**Modo offline:** continuidad y borradores; sin cola automática

## Nuevo módulo

`js/v8-quality-assurance.js`

El módulo se carga después de `v8-governance.js` y antes de los módulos operativos V7. Implementa funciones puras de inspección, exportación verificable y pantallas administrativas.

## Integridad del respaldo

1. Reúne la información autorizada disponible en memoria y en los stores de la sesión.
2. Elimina campos sensibles por nombre y omite imágenes embebidas excesivamente grandes.
3. Construye un manifiesto de cantidades.
4. Calcula SHA-256 sobre una serialización estable del bloque `data`.
5. Descarga un archivo JSON y registra solo sus metadatos en el dispositivo.

La validación recalcula la huella y compara cantidades e identificadores con la sesión actual. No existe código de restauración destructiva en el navegador.

## Calidad de datos

Se inspeccionan clientes, productos, ventas, movimientos de inventario, perfiles y borradores. Los resultados son advertencias; ninguna corrección se ejecuta por sí sola.

## Auditoría

Se combinan eventos de `audit_log`, cuando RLS lo permite, con los eventos de auditoría disponibles en memoria. El visor permite búsqueda, filtro y exportación CSV.

## Compatibilidad

- Conserva claves locales `nv805:*` para no perder borradores y última sincronización existentes.
- Actualiza el service worker a `nv-app-shell-v806`.
- Mantiene todos los módulos territoriales, autocompletado y Realtime anteriores.

## Pruebas incluidas

- Auditoría general del sitio.
- Auditoría del despliegue GitHub Pages.
- Autocompletado de clientes.
- Regresión territorial.
- Saneamiento y continuidad offline.
- Control administrativo V8.0.6.
- Pruebas unitarias del núcleo de calidad.
- Validación sintáctica de todos los archivos JavaScript.
