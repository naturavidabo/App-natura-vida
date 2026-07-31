# Natura Vida V8.2.7 — Informe técnico

## Objetivo
Afinar el Asistente IA como secretario operativo, corregir el botón flotante del robot, preparar ventas y cotizaciones con datos reales y mantener visible la rendición de caja aun cuando las tablas remotas todavía no estén activadas.

## Cambios principales

### 1. Robot flotante unificado
- Se eliminó la colisión entre la clase interna del SVG y la clase global `.fab`.
- La cabeza, el fondo y la insignia IA ahora forman un único botón.
- El botón completo cambia entre cuatro posiciones seguras para no cubrir acciones visibles.
- Se redibujó el robot con formas SVG livianas y una animación discreta de ojos/destello.

### 2. Asistente secretario operativo
- Reconoce solicitudes de venta y cotización, además de pagos, recibos, planes y rendiciones.
- Interpreta cantidades escritas con palabras, por ejemplo “tres aceites”.
- Distingue presentación y material, por ejemplo “500 ml PET”.
- Consulta el producto real, precio autorizado, costo y stock.
- Prepara una ficha de trabajo con opción de rechazar, editar o aprobar.
- Al aprobar una venta, abre Ventas con producto, cantidad, cliente y forma de pago prellenados.
- Al aprobar una cotización, abre el formulario de cotización prellenado.
- Ninguna operación se registra automáticamente.

### 3. Centro de trabajos
- Se reemplazó el historial simple de acciones por una bandeja de trabajos pendientes, aprobados y rechazados.
- Los borradores se conservan fuera del texto del chat para que no se pierdan en conversaciones largas.

### 4. Rendición de caja verificable
- Los totales de efectivo y cobros digitales se sustentan con una lista visible de ventas y pagos asignados al vendedor.
- Si faltan las tablas remotas, los movimientos locales siguen visibles.
- La aplicación diferencia entre falta de configuración remota y ausencia real de movimientos.
- La migración de rendiciones incluye recarga del esquema PostgREST para evitar el mensaje de tabla ausente en caché.

### 5. Motor externo
- El esquema de Gemini incorpora `prepare_sale` y `create_quote`.
- Los borradores estructurados incluyen productos, cantidades, forma de pago y tipo de venta.
- Se instruye expresamente al modelo para preparar una operación y no limitarse a explicar el procedimiento.

## Seguridad
- La IA prepara; el usuario revisa y confirma.
- No se modifican ventas, stock, deudas, pagos ni cotizaciones sin interacción humana.
- Se conserva el respaldo local cuando el motor externo no está disponible.
- Las claves privadas permanecen en Supabase Secrets.

## Instalación adicional
1. Publicar todos los archivos de la V8.2.7.
2. Reemplazar y desplegar `supabase/functions/nv-ai-assistant/index.ts` en la función existente `nv-ai-assistant`.
3. Si Supabase muestra que no existe `public.nv_seller_settlements`, ejecutar `supabase/migrations/20260730_v825_seller_settlements.sql`.
4. No crear otra función ni otra tabla con nombres diferentes.

## Límite del repositorio
El paquete contiene 99 archivos y permanece por debajo del límite de 100.
