# NATURA VIDA V4.8 — Buzón, acceso simple y control de usuarios

## Cambios principales

### Ingreso más simple
- Se volvió a mostrar la guía de ingreso inicial en la pantalla de login.
- Administrador: `admin / 12345678`.
- Vendedores: `vendedor1` hasta `vendedor20` / `23456`.
- El código de activación se mantiene solo para administrador.
- Los vendedores ya no necesitan código de activación; solo completan datos básicos y crean su contraseña personal.
- Luego del primer ingreso, el celular queda como usuario personal.

### Código administrador
- Código principal configurado: `1712601961`.
- También quedan aceptados los códigos usados anteriormente para evitar bloqueo accidental: `2712961` y `2721971`.

### Buzón de mensajes
- Se agregó un botón flotante de buzón con ícono de carta junto a la fecha.
- Si hay mensajes pendientes, aparece un punto rojo y contador.
- El administrador puede ver pedidos y avisos de representantes.
- Los representantes pueden ver sus mensajes o respuestas.

### Pedidos
- Cuando un representante envía un pedido online, también se genera mensaje para el administrador.
- El administrador puede ver pedidos desde el buzón y desde el módulo Pedido.

### Usuarios activos / bloqueo
- El panel Usuarios y roles ahora muestra usuarios locales.
- Si Supabase está configurado, el administrador también puede ver perfiles online.
- Permite activar/bloquear perfiles online si las políticas RLS lo autorizan.

### Supabase
- Se agregó la tabla `messages`.
- Se agregaron columnas opcionales `phone`, `city`, `document_id` a `profiles`.
- Se incluye archivo de actualización: `SUPABASE_UPDATE_V4_8_MESSAGES.sql`.
- El archivo completo `SUPABASE_SCHEMA.sql` también fue actualizado.

## Importante
Después de subir esta versión, ejecuta en Supabase el archivo:

`SUPABASE_UPDATE_V4_8_MESSAGES.sql`

No uses DROP TABLE si ya tienes datos; esta actualización no borra información.
