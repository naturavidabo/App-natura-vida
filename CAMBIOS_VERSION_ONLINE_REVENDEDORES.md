# NATURA VIDA V4.9 — Acceso estable y simplificado

## Correcciones principales

- Se eliminó la creación de accesos genéricos `vendedor2` a `vendedor20`.
- Se mantiene un solo acceso genérico para vendedores: `vendedor1 / 23456`.
- El administrador mantiene acceso inicial: `admin / 12345678`.
- El código único de activación del administrador queda en `27121961`.
- El código de activación solo se exige al administrador al completar su perfil inicial.
- Los vendedores ya no requieren código de activación.
- El ingreso local tiene prioridad sobre Supabase para evitar que la conexión online bloquee `admin` o `vendedor1`.
- Se eliminó la sincronización automática al iniciar sesión. La actualización debe hacerse manualmente desde `Recibir novedades`.
- Se mantiene el flujo de identificación: nombre, celular/WhatsApp, ciudad, C.I. opcional y nueva contraseña personal.
- Después del primer ingreso, el usuario entra con su celular y su nueva contraseña.

- Si el usuario ya fue personalizado, `admin / 12345678` y `vendedor1 / 23456` vuelven a abrir la pantalla de identificación sin bloquear el ingreso.
