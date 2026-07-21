# Natura Vida V8.2.0 — Informe técnico

## Objetivo

Consolidar ventas a crédito, pagos, saldos históricos y documentos financieros en una ficha única por cliente, sin alterar inventario por operaciones que ya fueron entregadas en la aplicación anterior.

## Modelo de datos

### `historicalReceivables`

Contiene una fila por venta histórica. Campos de protección:

- `sourceSystem: "Mi Negocio"`
- `origin: "Importado desde Mi Negocio"`
- `historicalActive: true`
- `inventoryImpact: false`
- `stockAlreadyDelivered: true`
- `historicalImportKey`: clave idempotente para evitar duplicados.

### `receivablePayments`

Los pagos posteriores se conservan como registros independientes. El campo `allocations` indica cuánto se aplicó a cada operación. Los pagos anulados permanecen auditables con `status: "voided"` y dejan de reducir el saldo.

### `financialDocuments`

Guarda una instantánea de cada documento emitido, su número correlativo, cliente, tipo y saldos al momento de la emisión.

### `paymentPlans`

Guarda el cronograma acordado sin convertirlo en pagos realizados ni modificar saldos.

## Cálculo de saldos

El saldo por operación se calcula como:

`total - pago inicial histórico - pagos activos asignados`

Los pagos anulados no participan en el cálculo. El saldo consolidado es la suma de los saldos individuales; no se crea una venta artificial consolidada.

## Numeración documental

La función SQL `nv_next_financial_document_number(prefix)` mantiene secuencias por usuario y prefijo. Si la RPC no está disponible, se emplea una secuencia local como contingencia; por eso la migración debe aplicarse antes de un uso multiusuario intenso.

Prefijos:

- `PED`, `COT`, `VEN` y recibos existentes se conservan.
- `REC`, `EC`, `COB`, `PPA`, `CAN`, `INF`, `HFC` y `CXC` se usan en el módulo financiero.

## Documentos

Los documentos se renderizan en canvas y pueden:

- verse en pantalla;
- descargarse como PDF paginado;
- descargarse como imagen;
- imprimirse;
- compartirse mediante Web Share o abrir WhatsApp.

El QR se incorpora solamente cuando el administrador configuró un QR limpio en su Perfil comercial.

## Seguridad y migración

- La migración no edita `sales` ni tablas de inventario.
- El importador SQL de Gabriela está revocado para `authenticated`; debe ejecutarse desde un contexto administrativo.
- La importación desde la interfaz usa claves idempotentes y requiere confirmación.
- Se incluyen consultas preflight de solo lectura.
- El respaldo real de Supabase debe generarse en el proyecto del usuario; no puede fabricarse desde el código fuente ni desde este entorno sin credenciales.

## Limitaciones conocidas

- Los productos exactos de las siete operaciones de Gabriela no estaban detallados en la especificación recibida. El paquete conserva el texto “Productos Natura Vida según venta original”; puede reemplazarse durante la importación si se dispone del detalle original.
- El envío directo de archivos a WhatsApp depende de Web Share del dispositivo. Como respaldo, la aplicación abre un mensaje de WhatsApp con el resumen.
- La prueba de lectura del QR, RLS y sincronización requiere el proyecto Supabase real y un dispositivo físico.
