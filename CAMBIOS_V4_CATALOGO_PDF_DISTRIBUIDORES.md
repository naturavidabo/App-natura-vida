# NATURA VIDA V4.4 — Corrección catálogo, compartir, precios por canal y online

## Correcciones críticas

### Catálogo PDF
- Se eliminó el uso de funciones gráficas que podían provocar el error "No se pudo generar el catálogo".
- El catálogo ya no usa imágenes de referencia pegadas como fondo.
- Las fotos de productos se insertan manteniendo proporción, sin aplastarse.
- Se mantiene el enfoque comercial para clientes: beneficios, bienestar, belleza, contacto y productos.

### Compartir archivos
- Copia de seguridad: el botón Compartir ahora intenta usar Web Share; si el navegador no permite adjuntar el archivo, descarga el archivo y abre una guía para enviarlo por WhatsApp como documento.
- Paquetes inteligentes: catálogo general y reportes parciales tienen el mismo flujo de compartir/descargar.
- Catálogo PDF: también usa el flujo robusto de compartir, descargar y fallback.

### Inventario y precios
Cada producto ahora maneja:
- costo calculado por insumos;
- precio público;
- precio mayorista;
- precio representantes.

El costo ya se calcula desde los insumos y se muestra como campo calculado.

### Ventas
Los canales quedan separados:
- Unitaria usa precio público.
- Mayorista usa precio mayorista.
- Representantes usa precio representantes.

### Decimales
- Los montos ya no se redondean siempre a enteros.
- Se conservan hasta 2 decimales cuando corresponde.

### Online Supabase
- Se agregó soporte para `market_price` en productos.
- Se actualizó `SUPABASE_SCHEMA.sql` con la columna de precio mayorista.
- Si ya existe la tabla `products`, se incluye la instrucción `alter table` correspondiente.
