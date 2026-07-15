# Natura Vida V7.3.0 — Gestión Comercial Inteligente

Versión de consolidación comercial basada en V7.2.5.

## Funciones principales

- Ventas unitarias y mayoristas con precios flexibles.
- Grupos de precios y descuentos personales.
- Beneficio comercial por cliente con vigencia y nota interna.
- Ventas por cobrar y pagos parciales.
- Cotizaciones / precios de oferta.
- Egresos, insumos y balance básico.
- Ficha avanzada del representante con stock, valor, pedidos, ventas, movimientos y productos de mayor rotación.
- Centro Comercial con alertas y oportunidades accionables.
- Supabase como única fuente persistente.
- GitHub Pages con workflow Node 24.

## Instalación en GitHub

1. Descomprimir el ZIP.
2. Reemplazar el contenido del repositorio.
3. Hacer commit y push a `main`.
4. Esperar que `Deploy Natura Vida to GitHub Pages` termine en verde.
5. En la app, entrar a Más → Actualizaciones → Actualizar ahora.

## SQL V7.3 obligatorio

Para que el grupo de precios asignado al representante también se aplique en su Compra online, ejecutar en Supabase SQL Editor:

1. `sql/2026-07-15_v7_3_0_representative_pricing.sql`
2. `sql/2026-07-15_v7_3_0_verify.sql`

La migración no elimina datos y puede ejecutarse más de una vez.
