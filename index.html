# NATURA VIDA V5.0 — Supabase núcleo + caché offline inteligente

## Objetivo
Transformar la app para que Supabase sea la fuente principal de datos y IndexedDB quede como caché offline, sin perder compatibilidad con respaldos anteriores.

## Cambios principales

### 1. Sincronización segura
- La app ya no borra inventario local del representante al recibir catálogo.
- Si el servidor no tiene productos, no se pisa la base local.
- Se guarda un snapshot automático antes de sincronizar.
- Se agrega sincronización incremental basada en `updated_at`.
- Se agrega cola de pendientes offline con reintento al volver internet.

### 2. Supabase como núcleo práctico
- Cuando el administrador guarda o edita un producto, la app intenta subirlo automáticamente a Supabase.
- Los representantes reciben novedades en segundo plano y también mediante el botón “Recibir novedades”.
- Si el ZIP trae `supabaseUrl` y `supabaseAnonKey` reales en `js/supabase-config.js`, los celulares ya no necesitan configurar manualmente.

### 3. Imágenes
- Se evita enviar base64 en productos, backups y payloads.
- Se prepara subida de fotos a Supabase Storage en el bucket `product-images`.
- En la base se almacena `photo_url`/URL, no imagen dentro del JSON.

### 4. Respaldos livianos
- El respaldo excluye imágenes base64.
- El respaldo ahora es de datos esenciales.
- La restauración combina datos; no borra todo por defecto.

### 5. Pedidos online
- El representante arma pedido desde la app.
- El pedido se guarda localmente y se sube online si hay Supabase.
- El administrador puede ver pedidos y marcarlos como aprobados o rechazados.

### 6. Buzón
- El buzón puede sincronizar mensajes desde Supabase.
- Se conserva cache local de mensajes.
- Se mantiene contador de no leídos.

### 7. SQL
- Se actualiza `SUPABASE_SCHEMA.sql`.
- Se agrega `SUPABASE_MIGRACION_V5_NO_BORRA_DATOS.sql`.
- El SQL no borra datos existentes.
- Para uso interno, RLS queda desactivado en tablas de negocio para evitar bloqueos operativos.

## Accesos iniciales
Administrador:
- usuario: `admin`
- contraseña: `12345678`
- código administrador: `27121961`

Vendedor:
- usuario: `vendedor1`
- contraseña: `23456`

Después del primer ingreso se usa celular + contraseña personal.
