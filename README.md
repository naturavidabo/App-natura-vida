# Natura Vida V7.4.0 — Producción y Trazabilidad

Versión construida sobre la base estable V7.3.0 e incorporada siguiendo el Documento Maestro de Arquitectura V8 XD.

## Funciones consolidadas

- Ventas unitarias y mayoristas con precios flexibles.
- Grupos de precios, beneficios por cliente y descuentos personales.
- Ventas por cobrar y pagos parciales.
- Cotizaciones, clientes, representantes, catálogo, recibos y Centro Comercial.
- Supabase como única fuente persistente y actualización mediante Realtime.

## Nuevo módulo V7.4

- Inventario de materia prima, ingredientes, envases, etiquetas y empaques.
- Compras y ajustes con historial de movimientos.
- Costo promedio ponderado por insumo.
- Stock mínimo y alertas de reposición.
- Órdenes de producción planificadas y en proceso.
- Consumo real de insumos al completar una orden.
- Generación de lote con código, rendimiento y trazabilidad.
- Cálculo de costo de insumos, costo directo, costo total, costo unitario y costo por ml.
- Aumento atómico del stock del producto terminado.
- Registro opcional y automático de compras de insumos en Finanzas y egresos.

## Instalación en GitHub

1. Descomprimir el ZIP.
2. Reemplazar el contenido del repositorio.
3. Ejecutar primero los SQL indicados en `LEER_PRIMERO_V7.4.0.txt`.
4. Hacer commit y push a `main`.
5. Esperar que `Deploy Natura Vida to GitHub Pages` termine en verde.
6. En la aplicación, entrar a **Más → Actualizaciones → Actualizar ahora**.

## SQL V7.4 obligatorio

Ejecutar en Supabase SQL Editor:

1. `sql/2026-07-15_v7_4_0_production.sql`
2. `sql/2026-07-15_v7_4_0_verify.sql`

La migración crea tablas exclusivas de producción, aplica RLS para administrador y añade dos RPC atómicas. No elimina datos existentes y puede ejecutarse nuevamente si una ejecución quedó incompleta.
