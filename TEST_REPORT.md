# Informe de saneamiento y verificación — Good King V0.8.0

Fecha de construcción: 26/07/2026

## Base utilizada

La entrega se construyó sobre el ZIP que estaba publicado en GitHub y que el usuario proporcionó, identificado internamente como Good King V0.6.0. La V0.7.0 se mantuvo como etapa interna: sus correcciones de imágenes, recetas y lista de mercado están incorporadas directamente en la V0.8.0.

La actualización conserva el nombre de la base local `goodKingDB` y permite saltar directamente de IndexedDB V5 a V7. No contiene instrucciones para borrar almacenes existentes.

## Alcance consolidado

- Venta rápida, pedidos, caja, clientes autorizados y fiados.
- Productos e imágenes optimizadas.
- Recetas y costos unitarios.
- Inventario teórico, mínimos, ajustes, mermas e historial de movimientos.
- Lista de mercado y compras vinculadas al stock.
- Gastos ocasionales y recurrentes.
- Reportes diarios y mensuales, impresión y CSV.
- Usuarios y roles administrados mediante Supabase.
- Cola offline, auditoría, respaldos, diagnóstico y sincronización autenticada.

## Corrección visual de fotografías

Se mantuvieron y reforzaron las correcciones iniciadas en la etapa V0.7.0:

- contenedor visual con proporción estable;
- `object-fit: contain` para conservar la fotografía completa;
- límites explícitos de ancho y alto;
- protección contra expansión de tarjetas por imágenes verticales;
- fondo Good King uniforme;
- optimización previa de nuevas cargas a WebP 1200 × 900;
- recurso alternativo cuando una imagen no puede cargarse.

## Persistencia y migración

Comparación automatizada contra el ZIP publicado:

- Base anterior: `goodKingDB`, versión 5, 17 almacenes.
- Base V0.8.0: `goodKingDB`, versión 7, 22 almacenes.
- Los 17 almacenes anteriores continúan presentes.
- Se agregan `recipesLocal`, `recipeItemsLocal`, `marketListsLocal`, `marketListItemsLocal` y `expensesLocal`.
- Los nuevos módulos están incluidos en exportación, respaldo y restauración.
- Se genera respaldo automático después de operaciones sensibles y al iniciar una migración.

## Verificaciones automáticas superadas

- Sintaxis de `app.js`, `v06.js`, `v07.js`, `v08.js`, `sw.js` y `config.js` mediante `node --check`.
- `manifest.webmanifest` y `version.json` válidos como JSON.
- 215 identificadores HTML revisados sin duplicados.
- Recursos locales del App Shell encontrados.
- Iconos PWA verificados: 192 × 192, 512 × 512, maskable 512 × 512 y Apple 180 × 180.
- Versión V0.8.0 coherente en HTML, JavaScript, manifest, Service Worker y archivo de versión.
- Service Worker con caché propio `good-king-v080-shell`, eliminación de cachés anteriores y precarga tolerante a fallos.
- ZIP final comprobado mediante prueba de integridad.
- No se detectaron claves `service_role`, secret keys ni contraseñas PostgreSQL en los archivos públicos.

## Flujos revisados por código

### Ventas e inventario

- La venta se guarda junto con movimiento económico, auditoría, número diario y cola de sincronización.
- Las recetas calculan el costo estimado y el consumo teórico de insumos.
- Cada consumo produce un movimiento trazable de inventario.
- La anulación conserva la venta, registra reversión económica y repone el inventario teórico.
- El doble toque de confirmación permanece protegido por bloqueo de operación.

### Compras

- La compra incrementa stock y recalcula costo promedio.
- Si se paga desde caja, crea una salida de efectivo asociada a la sesión abierta.
- Se conserva historial de precios por unidad y comparación con la compra anterior.
- La compra iniciada desde Mercado marca el artículo correspondiente como adquirido.

### Gastos

- Alta, edición, repetición y anulación.
- Categoría, fecha, monto, medio de pago y recurrencia.
- Los gastos en efectivo exigen caja abierta y afectan el efectivo esperado.
- Los pagos externos o QR no reducen el efectivo físico.

### Reportes

- Periodo diario o mensual.
- Ventas, efectivo, QR, costo estimado, gastos y ganancia neta estimada.
- Productos más vendidos, compras y deuda pendiente.
- Impresión y exportación CSV.
- Las compras no se restan por segunda vez cuando el costo de receta ya representa el consumo vendido.

### Supabase

- Migración `06_good_king_v080_migration.sql` idempotente.
- Nuevos campos de costo y consumo en ventas.
- Relación entre gasto y caja.
- Restricciones normalizadas para compras y movimientos.
- RPC idempotente `apply_inventory_movement_v080` para sumar movimientos sin duplicarlos y reducir conflictos entre dispositivos offline.
- Políticas RLS ajustadas para que el ayudante pueda sincronizar el consumo generado por una venta sin obtener control administrativo del inventario.

## Limitaciones de la verificación local

Se intentó abrir la aplicación con Chromium automatizado dentro del entorno de construcción. El navegador fue bloqueado por las restricciones administrativas/red del entorno y no llegó a cargar la página; por ello no se declara una prueba visual interactiva completa como superada.

Las siguientes pruebas requieren el entorno real del usuario:

1. Ejecutar la migración SQL en el proyecto Supabase de Good King.
2. Iniciar sesión con administrador, propietaria y ayudante reales.
3. Actualizar la PWA instalada directamente desde la versión publicada a V0.8.0.
4. Confirmar que IndexedDB conserva ventas y configuración reales.
5. Registrar una venta offline y comprobar su sincronización posterior.
6. Registrar simultáneamente ventas desde computadora y celular y verificar que el stock remoto sume ambos movimientos sin duplicados.
7. Cargar fotografías a Supabase Storage y revisarlas en ambos dispositivos.
8. Probar respaldo y restauración con una copia real antes de comenzar la operación definitiva.

## Orden seguro de publicación

1. Descargar un respaldo desde la versión actualmente publicada.
2. Ejecutar `supabase/06_good_king_v080_migration.sql`.
3. Ejecutar `supabase/07_good_king_v080_verification.sql`.
4. Reemplazar los archivos de GitHub Pages por el paquete V0.8.0.
5. Abrir Good King y aceptar la actualización.
6. Ejecutar **Más → Configuración → Verificar ahora**.
7. Realizar una venta de prueba, una compra, un gasto y un reporte.
8. Confirmar la sincronización desde el segundo dispositivo.

No utilizar **Borrar datos del sitio** ni desinstalar la PWA como método de actualización.
