# Actualización de arquitectura — Good King V0.8.0

La V0.8.0 consolida en una sola publicación las etapas internas V0.7 y V0.8. Mantiene el principio local-first: la operación se confirma en IndexedDB y después se sincroniza con Supabase.

## Cambios de arquitectura

- Las ventas conservan `estimatedCost` e `inventoryConsumption`.
- La receta determina el consumo teórico por unidad vendida.
- Una anulación crea movimientos de reversión, sin eliminar el historial.
- Compras y gastos pagados desde caja crean movimientos negativos.
- Abonos en efectivo crean movimientos positivos.
- El efectivo esperado se calcula con todos los movimientos activos de la jornada.
- Los reportes separan compras de inventario y gastos operativos para no duplicar costos.
- Los usuarios se administran con Auth + `business_members`; no se exponen claves administrativas.
- Los movimientos remotos de inventario se aplican mediante la RPC idempotente `apply_inventory_movement_v080`; un mismo evento no puede sumar o restar stock dos veces.
- El historial local expone compras, ventas, reversiones, ajustes y mermas sin alterar los registros originales.
- Las compras mantienen costo promedio y comparación de precio unitario con la adquisición anterior.
- IndexedDB migra directamente desde la versión publicada V5 a V7, manteniendo todos los almacenes anteriores.
