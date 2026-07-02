# Pruebas reales de la auditoría V6.5

Esta carpeta contiene las pruebas automáticas que se usaron para la
auditoría de sincronización del 27 de junio de 2026 (ver
`AUDITORIA_V6_5_SINCRONIZACION.md` en la carpeta principal del proyecto).

## Qué son

Cargan los archivos `.js` **reales** del proyecto (no copias, no
versiones simplificadas) dentro de un entorno Node.js, con una base de
datos local simulada (en lugar de IndexedDB) y un backend de Supabase
simulado en memoria (en lugar de tu proyecto real). Esto permite
ejecutar la lógica de login, sincronización, cola offline y stock
atómico de verdad, con varios "dispositivos" virtuales compartiendo el
mismo backend simulado.

**No sustituyen una prueba en tu Supabase real.** Sirven para detectar
errores de lógica en el código (como los 3 bugs que se encontraron y
corrigieron con ellas) sin necesidad de tener dos celulares a mano y sin
arriesgar datos reales.

## Cómo correrlas

Requiere tener [Node.js](https://nodejs.org) instalado (cualquier
versión reciente, 18 o superior). No necesita conexión a internet ni
instalar nada con `npm`.

```
cd auditoria-pruebas-2026-06-27
node test1-login.js
node test234-tables.js
node test5-queue.js
node test6-stock.js
node test7-no-hang.js
```

Cada línea debe mostrar `✅ PASA`. Si alguna muestra `❌ FALLA`, el texto
después de la línea explica qué se esperaba y qué pasó realmente — es la
forma más rápida de detectar si un cambio futuro rompió algo que antes
funcionaba.

## Archivos

- `idb-shim.js`: una versión mínima de IndexedDB en memoria.
- `supabase-mock.js`: un backend de Supabase simulado (tablas, login,
  RPC de ajuste de stock, simulación de RLS).
- `harness.js`: carga los archivos reales del proyecto (`../js/*.js`)
  dentro de ese entorno simulado.
- `test*.js`: las pruebas en sí, una por cada punto de la auditoría.
