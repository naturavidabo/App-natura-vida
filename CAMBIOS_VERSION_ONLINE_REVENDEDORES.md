# Cambios — Versión online con revendedores

## Objetivo implementado
La app queda preparada para trabajar online con Supabase gratuito, manteniendo IndexedDB offline.

## Nuevo flujo comercial

### Administrador
- Crea y actualiza productos.
- Define costo, precio revendedor y precio público.
- Puede publicar el catálogo al servidor.
- Los cambios de precio quedan disponibles para revendedores.

### Revendedor
- Ingresa con cuenta online.
- Actualiza catálogo/precios desde el servidor.
- No puede modificar productos ni precios oficiales.
- Ve precio base revendedor y precio público sugerido.
- Puede colocar su propio precio de venta.
- La app calcula margen por unidad y margen total.
- Puede generar venta y recibo.

## Archivos nuevos
- `js/supabase-config.js`
- `js/supabase-sync.js`
- `SUPABASE_SCHEMA.sql`
- `GUIA_SERVIDOR_GRATUITO_SUPABASE.md`

## Archivos modificados
- `index.html`
- `service-worker.js`
- `js/auth.js`
- `js/app.js`
- `js/db.js`
- `js/products.js`
- `js/sales.js`
- `css/app.css`

## Ejemplo de margen revendedor
- Precio base revendedor: Bs 100
- Precio sugerido público: Bs 150
- Si vende en Bs 150, margen: Bs 50
- Si vende en Bs 140, margen: Bs 40
- Si vende en Bs 160, margen: Bs 60
