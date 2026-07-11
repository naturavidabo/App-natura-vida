# Análisis de archivos recibidos

## 1. backup.mn — Mi Negocio

Archivo `.mn` comprimido con base SQLite interna `BD_MiNegocio`.

Resultado extraído:

- Ventas encontradas: 34
- Líneas de productos vendidos: 66
- Clientes guardados: 24
- Clientes consolidados por nombre: 22
- Productos en inventario del backup: 5
- Cotizaciones: 1
- Total vendido en este backup: Bs 27,047.00
- Periodo: 2025-06-17 al 2025-12-06
- Celulares encontrados: 0
- Ventas por cobrar detectadas: 0

Conclusión: este backup no trae números de celular y no trae ventas por cobrar identificables. Las ventas se prepararon como históricas pagadas y sin impacto en stock.

## 2. NVB_PEDIDO_75659977_2026-06-24-02-53-28.json

No es backup de Mi Negocio. Es un paquete de pedido local de Natura Vida:

- Representante: Pepe grillo
- Usuario: 75659977
- Producto: Aceite de coco 500ml
- Cantidad: 2
- Total: Bs 194
- Estado: pending

No lo importé como venta, porque es pedido pendiente de representante y podría duplicar una operación de prueba o una operación ya resuelta.

## 3. Consolidado generado

El SQL consolidado une:

- Backup anterior: 69 ventas / Bs 72.750,50
- Este backup: 34 ventas / Bs 27.047,00

Total consolidado:

- Ventas: 103
- Líneas: 202
- Clientes consolidados por nombre: 38
- Total histórico: Bs 99.797,50
- Impacto en stock: NO

## 4. Cuentas por cobrar

En este backup no aparece deuda. Para el otro celular, cuando envíes la copia, se revisará:

- tabla `venta`
- columna `status`
- columna `pagos`
- formas de pago
- cuentas nominales
- texto de notas: debe, deuda, pendiente, cobrar, crédito

Si se detecta deuda, se importará con:

- `paymentStatus: pending` o `partial`
- `amountPaid`
- `balanceDue`
- `receivable: true`
- cliente deudor
- detalle de productos
- fecha original
- origen Mi Negocio
- sin descontar stock actual
