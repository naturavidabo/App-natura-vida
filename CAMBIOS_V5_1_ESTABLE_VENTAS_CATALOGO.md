# NATURA VIDA V5.1 — Estabilización de ventas, catálogo y cotizaciones

## Correcciones críticas

### Ventas
- Se corrigió el error que impedía confirmar ventas.
- Se corrigió la generación de recibo después de registrar la venta.
- Se permite registrar ventas aunque el margen sea negativo; la utilidad queda reflejada en reportes/inventario.

### Cotizaciones
- Se agregó generación real de imagen JPG de cotización.
- Se mantiene compartir texto, pero ahora también existe guardar/compartir imagen.

### Publicar catálogo
- Se mejoró la publicación por lotes hacia Supabase.
- Se mejoraron mensajes de error para indicar si falta ejecutar la migración SQL.
- Se agregó migración V5.1 para completar columnas faltantes si la tabla products fue creada manualmente o quedó incompleta.

### Supabase
- Nuevo archivo recomendado: SUPABASE_MIGRACION_V5_1_ESTABLE.sql
- No borra datos existentes.
- Completa columnas faltantes de products, sales, purchase_orders y messages.

### Mensajería / buzón
- Se eliminó la consulta automática constante a Supabase al renderizar.
- El buzón actualiza online sólo al abrirlo o presionar actualizar.
- Se limita la carga visual a 80 mensajes para evitar congelamientos en Android.

### UI
- Se quitó el botón de Comisiones de accesos rápidos y de Más.
- Se mantiene la estructura interna por compatibilidad, pero no se muestra al usuario.

### Backups
- Se mantiene respaldo compacto sin imágenes base64.
