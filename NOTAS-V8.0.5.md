# Natura Vida V8.0.5 — Continuidad de sesión y modo sin conexión seguro

## Objetivo
Mantener la aplicación estable ante cortes temporales de internet sin recuperar la antigua cola offline automática.

## Implementado
- App shell instalada para abrir la PWA después de una primera carga correcta.
- Franja discreta de estado: sin conexión, reconectando y conexión restablecida.
- Conservación de la pantalla, sesión y contexto actual.
- Última fecha de actualización confirmada.
- Copia local temporal de solo lectura de datos ya cargados.
- Borrador local del formulario cuando se corta internet.
- Revisión y restauración manual del borrador.
- Bloqueo preventivo de ventas, pagos, inventario, precios, usuarios y demás mutaciones sin internet.
- Reconexión automática con Supabase y reinicio controlado de Realtime.
- Centro de continuidad dentro de Configuración.

## Límites deliberados
- No existe cola offline.
- Ninguna venta, pago o ajuste se envía automáticamente al volver internet.
- Supabase continúa siendo la única fuente oficial.
- Los datos locales son temporales, de lectura y apoyo de continuidad.
