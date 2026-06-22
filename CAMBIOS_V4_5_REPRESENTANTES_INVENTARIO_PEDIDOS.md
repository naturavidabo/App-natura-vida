# NATURA VIDA V4.5 — Representantes: inventario propio, ventas y pedidos

## Problemas corregidos

### Inventario del representante
- El representante ya puede editar su propio inventario local.
- Puede actualizar stock propio.
- Puede agregar costo adicional por transporte, envío u operación regional.
- Puede definir su precio unitario propio.
- Puede definir su precio mayorista propio.
- El precio base del administrador queda visible como referencia, pero no editable por el representante.

### Ventas del representante
- El representante ya no queda limitado a un solo tipo de venta.
- Ahora tiene botones propios:
  - Unitaria
  - Mayorista
- La venta usa los precios propios definidos por el representante.
- La utilidad se calcula contra su costo real: precio base administrador + costo adicional.

### Grupos de precio
- La sección Grupos de precio queda accesible para representantes.
- En ventas, si existen grupos, pueden aplicarse como ajuste opcional.

### Actualización online
- “Actualizar precios” se renombró a “Actualizar catálogo”.
- Al sincronizar desde Supabase, el representante conserva:
  - su stock local
  - su costo adicional
  - sus precios propios
  - sus observaciones locales
- El catálogo online actualiza nombre, descripción, fotos y precios base sin pisar su gestión regional.

### Pedido al administrador
- Se agregó módulo “Pedido al administrador”.
- El representante puede armar un pedido con cantidades por producto.
- Si Supabase está activo, se intenta enviar online.
- Si no hay online, se genera un archivo JSON compartible por WhatsApp.
- El administrador puede importar pedidos inteligentes desde “Intercambio inteligente”.

## Archivos modificados
- js/products.js
- js/sales.js
- js/app.js
- js/orders.js
- js/db.js
- js/smart-packages.js
- js/supabase-sync.js
- css/app.css
- index.html
- service-worker.js
- SUPABASE_SCHEMA.sql
