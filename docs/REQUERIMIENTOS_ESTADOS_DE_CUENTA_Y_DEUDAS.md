## ACTUALIZACIÓN CORREGIDA DE NATURA VIDA

### Deudas activas, estados de cuenta y documentos consolidados de cobro

Quiero que realices una nueva versión corregida de la aplicación **Natura Vida**, respetando todo lo que ya funciona y sin perder información existente.

La actualización debe enfocarse principalmente en corregir la visualización y gestión de las deudas de los clientes, especialmente las deudas históricas recuperadas desde la aplicación anterior **Mi Negocio**.

---

# 1. OBJETIVO PRINCIPAL

La aplicación no debe limitarse a mostrar una lista simple de deudas.

Cada cliente debe tener una **ficha financiera completa**, desde donde se pueda consultar:

* Sus pedidos.
* Sus ventas.
* Sus compras a crédito.
* Sus pagos realizados.
* Sus pagos parciales.
* Sus deudas pendientes.
* Las fechas de cada deuda.
* Los productos entregados.
* El saldo por cada operación.
* La deuda total acumulada.
* Los documentos generados.
* El historial completo de movimientos.

La información debe presentarse de forma clara, ordenada, profesional y fácil de comprender.

---

# 2. DEUDAS HISTÓRICAS RECUPERADAS

Las deudas recuperadas del archivo anterior deben registrarse como **deudas activas reales**, no como simples observaciones ni como información pendiente de revisión.

Deben conservarse:

* La fecha original.
* El nombre del cliente.
* El número original de venta.
* Los productos entregados.
* El total de la venta.
* El monto pagado.
* Los pagos parciales.
* El saldo pendiente.
* Las observaciones originales.
* El origen del registro: “Importado desde Mi Negocio”.
* La indicación de que no afecta nuevamente el inventario.

Estas ventas antiguas no deben volver a descontar stock porque los productos ya fueron entregados en su momento.

## Caso confirmado de Gabriela Espinoza

Gabriela Espinoza debe aparecer con una deuda activa total de:

### Bs 5.426,20

Distribuida en las siguientes ventas:

| Fecha      | Total venta |      Pagado | Saldo pendiente |
| ---------- | ----------: | ----------: | --------------: |
| 20/09/2020 | Bs 1.243,20 | Bs 1.000,00 |       Bs 243,20 |
| 28/12/2020 | Bs 2.030,00 |     Bs 0,00 |     Bs 2.030,00 |
| 28/12/2020 | Bs 1.694,00 | Bs 1.095,00 |       Bs 599,00 |
| 12/09/2022 |   Bs 448,00 |     Bs 0,00 |       Bs 448,00 |
| 18/05/2023 | Bs 1.570,00 |     Bs 0,00 |     Bs 1.570,00 |
| 18/05/2023 |   Bs 270,00 |     Bs 0,00 |       Bs 270,00 |
| 18/05/2023 |   Bs 266,00 |     Bs 0,00 |       Bs 266,00 |

Total pagado registrado:

### Bs 2.095,00

Saldo pendiente:

### Bs 5.426,20

Esta deuda debe aparecer directamente en:

**Clientes → Gabriela Espinoza → Estado de cuenta**

y también en:

**Finanzas → Cuentas por cobrar**

No debe aparecer como pagada, descartada ni pendiente de revisión.

---

# 3. FICHA FINANCIERA DEL CLIENTE

Al abrir un cliente, debe existir una sección denominada:

## Estado de cuenta

Debe incluir un resumen superior con tarjetas claras:

* Total comprado.
* Total pagado.
* Total adeudado.
* Cantidad de ventas pendientes.
* Último pago.
* Deuda más antigua.
* Días de atraso.

Debajo deben existir pestañas:

### Resumen

Vista general del cliente.

### Deudas activas

Todas las ventas que todavía tienen saldo pendiente.

### Pagos

Todos los pagos completos y parciales realizados.

### Pedidos

Pedidos realizados, pendientes, entregados o cancelados.

### Ventas

Historial completo de ventas.

### Documentos

Cotizaciones, pedidos, recibos, estados de cuenta y documentos de cobro generados.

---

# 4. LISTA DE DEUDAS

La pantalla de cuentas por cobrar debe mejorar completamente.

Cada tarjeta o fila debe mostrar como mínimo:

* Nombre del cliente.
* Número de operaciones pendientes.
* Monto total adeudado.
* Fecha de la deuda más antigua.
* Fecha del último pago.
* Días de atraso.
* Estado.
* Responsable o vendedor.
* Región.
* Botón “Ver estado de cuenta”.
* Botón “Registrar pago”.
* Botón “Generar cobro”.

No mostrar solamente una lista desordenada de nombres y montos.

Debe incluir buscador y filtros por:

* Cliente.
* Región.
* Vendedor.
* Fecha.
* Deuda vencida.
* Deuda no vencida.
* Deuda histórica.
* Monto.
* Estado.
* Días de atraso.

También debe permitir ordenar por:

* Mayor deuda.
* Menor deuda.
* Deuda más antigua.
* Deuda más reciente.
* Nombre del cliente.

---

# 5. INFORME COMPLETO DE DEUDAS POR CLIENTE

La aplicación debe poder realizar un informe completo de las deudas de cualquier cliente, por ejemplo:

* Memalik.
* Gabriela Espinoza.
* Representantes.
* Clientes mayoristas.
* Clientes minoristas.

Este informe debe consolidar todas las operaciones pendientes del cliente.

Debe contener:

* Datos del cliente.
* Número de celular.
* Región.
* Vendedor responsable.
* Fecha del informe.
* Número del documento.
* Detalle de cada pedido o venta.
* Fecha de la operación.
* Número de venta.
* Productos entregados.
* Total de la venta.
* Pagos realizados.
* Saldo por operación.
* Días de atraso.
* Deuda total.
* Observaciones.
* Forma de pago.
* Datos para realizar el pago.
* Firma del responsable.
* Firma o conformidad del cliente.

---

# 6. RECIBO CONSOLIDADO DE COBRO

Agregar obligatoriamente el botón:

## Generar recibo consolidado de cobro

Este documento debe reunir en una sola hoja o archivo todas las deudas pendientes del cliente.

Ejemplo:

**NATURA VIDA BOLIVIA**
**ESTADO DE CUENTA Y RECIBO CONSOLIDADO DE COBRO**

Cliente: Memalik
Fecha de emisión: 20/07/2026
Documento N.º: EC-000125

| Fecha      | N.º de pedido | Detalle               |    Total | Pagado |    Saldo |
| ---------- | ------------- | --------------------- | -------: | -----: | -------: |
| 10/05/2026 | PED-0152      | Aceite de coco        |   Bs 850 | Bs 300 |   Bs 550 |
| 22/05/2026 | PED-0176      | Productos Natura Vida |   Bs 620 | Bs 200 |   Bs 420 |
| 04/06/2026 | PED-0201      | Pedido mayorista      | Bs 1.100 |   Bs 0 | Bs 1.100 |

### DEUDA TOTAL ACUMULADA: Bs 2.070

El documento debe incluir:

* Logotipo de Natura Vida.
* Nombre completo del cliente.
* Número de celular.
* Fecha de emisión.
* Número correlativo.
* Detalle de todas las deudas.
* Pagos parciales.
* Saldo total.
* Código QR de pago, cuando esté disponible.
* Datos bancarios o número de pago.
* Fecha límite de pago.
* Nombre del vendedor o administrador.
* Región.
* Firma.
* Observaciones.

---

# 7. FORMATOS DEL DOCUMENTO

El usuario debe poder:

* Ver el documento en pantalla.
* Descargarlo en PDF.
* Imprimirlo.
* Compartirlo por WhatsApp.
* Enviarlo como imagen.
* Descargar una versión resumida.
* Descargar una versión detallada.

El PDF debe estar correctamente diseñado, sin textos cortados, tablas desbordadas ni letras demasiado pequeñas.

---

# 8. TIPOS DE DOCUMENTOS QUE DEBE GENERAR LA APLICACIÓN

La aplicación debe generar los siguientes documentos:

1. Nota de pedido.
2. Cotización.
3. Comprobante de venta.
4. Recibo de pago.
5. Recibo de pago parcial.
6. Estado de cuenta.
7. Recibo consolidado de cobro.
8. Plan de pagos.
9. Constancia de cancelación total.
10. Informe de deuda por cliente.
11. Informe general de cuentas por cobrar.
12. Historial financiero del cliente.

Cada documento debe tener numeración correlativa propia.

Ejemplos:

* PED-000001
* COT-000001
* VEN-000001
* REC-000001
* EC-000001
* COB-000001

---

# 9. REGISTRO DE PAGOS

Cuando el cliente realice un pago, la aplicación debe permitir elegir cómo aplicarlo:

* A la deuda más antigua.
* A una venta específica.
* A varias ventas.
* Como pago general a cuenta.
* Como cancelación total.
* Como pago parcial.

La aplicación debe guardar:

* Fecha.
* Hora.
* Monto.
* Método de pago.
* Número de comprobante.
* Imagen del comprobante.
* Responsable que registró el pago.
* Observación.
* Deudas afectadas.
* Saldo anterior.
* Saldo posterior.

Después del pago debe generar automáticamente un recibo.

---

# 10. REGLAS IMPORTANTES

* No eliminar las ventas originales.
* No unir físicamente todas las deudas en una sola venta.
* Cada operación debe conservar su propio historial.
* El recibo consolidado solamente debe reunirlas en un documento.
* No volver a descontar stock por ventas históricas.
* No marcar como pagadas deudas que tienen saldo.
* No convertir deudas confirmadas en simples observaciones.
* No modificar fechas antiguas.
* No duplicar clientes, ventas, pagos ni deudas.
* No eliminar información ya existente.
* No perder compatibilidad con versiones anteriores.
* Toda modificación debe quedar registrada en auditoría.

---

# 11. BASE DE DATOS Y SEGURIDAD

Antes de modificar la aplicación:

* Crear respaldo de la base de datos.
* Verificar tablas actuales.
* Verificar cómo se registran clientes, ventas, pagos y deudas.
* Hacer migraciones seguras.
* Evitar duplicados.
* Utilizar identificadores únicos.
* Probar la restauración del respaldo.
* Probar primero con datos de prueba.
* Confirmar que las ventas históricas no afecten inventario.
* Confirmar que los saldos aparezcan correctamente.

La actualización debe conservar todos los datos actuales.

---

# 12. DISEÑO DE LA INTERFAZ

La sección financiera debe tener un estilo:

* Moderno.
* Profesional.
* Limpio.
* Fácil de leer.
* Adaptado a celular y computadora.
* Colores verdes institucionales de Natura Vida.
* Montos grandes y visibles.
* Botones claros.
* Tablas fáciles de comprender.
* Estados identificados visualmente.

Estados sugeridos:

* Al día.
* Pendiente.
* Parcial.
* Vencido.
* En mora.
* Cancelado.
* Histórico activo.

No utilizar letras demasiado pequeñas ni tarjetas con espacios desperdiciados.

---

# 13. PRUEBAS OBLIGATORIAS

Antes de entregar la versión, probar como mínimo:

1. Buscar a Gabriela Espinoza.
2. Verificar que su deuda sea Bs 5.426,20.
3. Abrir sus siete operaciones pendientes.
4. Verificar los Bs 2.095 pagados.
5. Generar su estado de cuenta.
6. Generar un recibo consolidado.
7. Descargarlo en PDF.
8. Registrar un pago parcial de prueba.
9. Verificar la reducción correcta del saldo.
10. Verificar que no se descuente stock.
11. Anular el pago de prueba.
12. Verificar la restauración del saldo.
13. Buscar otro cliente como Memalik.
14. Generar un solo documento con todas sus deudas.
15. Probar la visualización en celular y computadora.

---

# 14. ENTREGA SOLICITADA

Entregar una nueva versión corregida que incluya:

* Código completo actualizado.
* Migraciones SQL necesarias.
* Respaldo previo.
* Instrucciones de instalación.
* Instrucciones para importar las deudas recuperadas.
* Informe de cambios realizados.
* Resultado de las pruebas.
* Archivo listo para desplegar.
* Confirmación de que no se perdieron datos.

No entregar solamente explicaciones o fragmentos de código. Debe entregarse la versión completa, funcional, probada y lista para reemplazar la versión anterior.

El nombre sugerido para esta actualización es:

## Natura Vida V8.0.2 — Estados de cuenta, deudas activas y documentos de cobro
