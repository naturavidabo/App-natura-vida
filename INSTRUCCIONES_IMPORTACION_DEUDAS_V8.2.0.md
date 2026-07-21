# Importación de deudas recuperadas de Mi Negocio

## Antes de importar

1. Genere un respaldo real de Supabase.
2. Verifique que el cliente exista o acepte que la aplicación cree una ficha rápida.
3. No importe el mismo archivo desde dos dispositivos simultáneamente.
4. Revise que cada fila tenga cliente, fecha, número de venta, total, pagado y saldo.

## Importación desde la aplicación

1. Abra **Finanzas → Cuentas por cobrar**.
2. Pulse **Importar deudas históricas**.
3. Seleccione un JSON o CSV.
4. Revise la vista previa: nuevos, duplicados omitidos y saldo total.
5. Confirme.

La aplicación normaliza los datos y guarda cada venta por separado. No crea movimientos de stock.

## Plantilla CSV

Columnas:

`cliente;fecha;numero_venta;productos;total_venta;pagado;saldo_pendiente;observaciones`

## Caso Gabriela Espinoza

La versión incluye `data/imports/gabriela-espinoza-mi-negocio.json` con siete operaciones verificadas:

- Total vendido: Bs 7.521,20.
- Total pagado: Bs 2.095,00.
- Saldo activo: Bs 5.426,20.

## Duplicados

La clave combina el origen, cliente, fecha, número y monto. Si una fila ya existe, se omite. No elimine manualmente esa clave para volver a importar, salvo una corrección administrada y auditada.
