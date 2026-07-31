# Registro de cambios Good King

## V0.8.0 — Consolidación operativa, gastos, reportes y sincronización

### Funciones agregadas

- Gastos por categoría, fecha, forma de pago y recurrencia.
- Impacto de gastos y compras en efectivo sobre el cierre de caja.
- Reportes diarios y mensuales con ventas, costo estimado, gastos, ganancia y productos más vendidos.
- Impresión de reportes y exportación CSV.
- Consulta de usuarios y roles; actualización de membresías por el administrador.
- Consumo automático de inventario al vender productos con receta.
- Historial visual de movimientos: compras, ventas, reversiones, ajustes y mermas.
- Comparación del costo unitario de compras frente al registro anterior.
- Reversión del consumo al anular una venta.
- Costo estimado guardado por venta para reportes históricos.

### Correcciones

- Compra remota usa `cash_register`, compatible con la restricción de Supabase.
- Movimientos de inventario usan tipos aceptados por PostgreSQL.
- Abonos en efectivo incrementan el efectivo esperado de caja.
- Ventas anuladas descuentan correctamente el movimiento original.
- Fotografías conservan relación de aspecto y ya no expanden las tarjetas.
- Service Worker actualizado e inclusión de `v08.js` en la caché PWA.

### Datos y migración

- IndexedDB pasa de V6 a V7 sin eliminar almacenes anteriores.
- Se agrega `expensesLocal` a respaldos y restauraciones.
- Supabase agrega costo estimado, consumo de inventario y relación gasto-caja.
- Se ajustan políticas RLS para sincronizar el consumo automático generado por el ayudante al vender.

### Funciones aún no incluidas

- WhatsApp Business automático.
- Confirmación bancaria automática de QR.
- Delivery propio y promociones avanzadas.
