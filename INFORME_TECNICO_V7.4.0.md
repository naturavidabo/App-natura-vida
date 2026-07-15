# Informe técnico Natura Vida V7.4.0

## Objetivo

Incorporar la fase V7.4 definida en la arquitectura maestra: producción, insumos, lotes, rendimientos y costo real, sin alterar los flujos ya estabilizados de ventas, stock comercial, clientes, representantes, cobros y recibos.

## Alcance implementado

### Inventario de insumos

- Registro de materia prima, ingredientes, envases, etiquetas, empaques y otros insumos.
- Unidad configurable, proveedor, stock mínimo, estado y observaciones.
- Compras, ajustes de entrada y ajustes de salida.
- Costo promedio ponderado actualizado en Supabase.
- Historial trazable de movimientos.
- Semáforo de stock crítico.

### Producción

- Creación de órdenes por producto terminado.
- Cantidad planificada, unidad de salida, contenido por unidad e insumos previstos.
- Estados planificada, en proceso, completada y cancelada.
- Cierre de producción con cantidades reales.
- Código de lote automático y editable.
- Costo de insumos, mano de obra/servicios, costo total, costo unitario y costo por ml.
- Ficha histórica de cada lote.

### Integridad y Supabase

- Tablas nuevas: `raw_materials`, `raw_material_movements`, `production_orders` y `production_batches`.
- RLS restringido al administrador activo.
- RPC `register_raw_material_movement_v74` para modificar insumos sin stock negativo.
- RPC `complete_production_order_v74` para consumir insumos, crear lote, actualizar costo y aumentar stock terminado en una sola transacción.
- Idempotencia por identificador de movimiento y lote para reducir duplicados ante reintentos.
- Auditoría de movimientos y cierres de producción.
- Realtime incorporado para las cuatro tablas nuevas.

### Integración financiera

- Una compra de insumo puede registrarse automáticamente como egreso dentro de la misma transacción.
- La opción se muestra activada por defecto y puede desmarcarse cuando el egreso ya fue contabilizado por otra vía.

## Cambios de interfaz

- Nueva opción **Producción e insumos** dentro de **Más** para administrador.
- Navegación interna por Resumen, Insumos, Órdenes y Lotes.
- Formularios adaptados a celular y hojas desplazables para evitar que el teclado cubra la confirmación.
- La opción anterior se renombró a **Finanzas y egresos** para separar fabricación de gastos operativos.

## Archivos principales añadidos

- `js/v7-production.js`
- `sql/2026-07-15_v7_4_0_production.sql`
- `sql/2026-07-15_v7_4_0_verify.sql`

## Validación local

- Sintaxis de todos los archivos JavaScript verificada con `node --check`.
- Auditoría estática actualizada para V7.4.0.
- Auditoría de empaquetado de GitHub Pages mantenida.
- Versionado actualizado en HTML, manifest, service worker, gestor de actualización y configuración Supabase.

## Límite de verificación

La transacción real de producción y las políticas RLS deben probarse en el proyecto Supabase del usuario después de ejecutar el SQL V7.4. La revisión local comprueba estructura, sintaxis, referencias y empaquetado, pero no sustituye una prueba autenticada con datos reales controlados.
