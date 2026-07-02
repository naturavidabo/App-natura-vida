# NATURA VIDA V4.7 — Sincronización segura y ventas limpias

## Correcciones críticas

### 1. Sincronización segura para representantes
- Se desactivó la actualización automática al iniciar sesión.
- La actualización online ahora es manual mediante “Recibir novedades”.
- Si Supabase no tiene productos publicados, la app bloquea la actualización y no toca el inventario local.
- Antes de actualizar, se crea un respaldo local automático previo a la sincronización.
- La actualización mezcla catálogo del servidor con inventario local del representante.
- No se borra stock local del representante.
- No se borran precios propios del representante.
- No se borran costos adicionales/transporte.
- No se borran clientes, ventas ni cotizaciones locales.
- Si el producto del servidor coincide por nombre/categoría aunque tenga otro ID, se conservan los datos locales del representante.

### 2. Área de ventas más limpia
- Se retiró información de costo, margen, base administrador y costo real del área de ventas.
- El área de ventas ahora muestra solamente lo necesario para vender:
  - canal de venta,
  - producto,
  - precio de venta,
  - stock,
  - selector de cantidad,
  - carrito.
- Los datos de costos, márgenes, transporte y precios propios quedan en Inventario.

### 3. Accesos iniciales confirmados
- Administrador inicial: usuario `admin`, contraseña `12345678`.
- Vendedores iniciales: `vendedor1` hasta `vendedor20`, contraseña `23456`.
- Código de activación local: `2721971`.
- Después del primer ingreso se pide perfil básico y contraseña personal.
- Luego el usuario personal pasa a ser el número de celular.

### 4. PWA
- Actualización de caché a `natura-vida-v4-7-sync-segura-ventas-limpias`.
