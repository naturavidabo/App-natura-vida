# Natura Vida V8.4.0 — Director Administrativo Inteligente y sesión persistente

## Corrección crítica de autenticación

La sesión de Supabase ahora utiliza un adaptador persistente propio compatible con `supabase-js`:

- copia principal en `localStorage`;
- copia espejo en IndexedDB;
- reserva limitada de recuperación cuando Supabase retira temporalmente la sesión sin que el usuario haya pulsado **Cerrar sesión**;
- marca explícita para impedir que una sesión cerrada voluntariamente vuelva a aparecer;
- solicitud de almacenamiento persistente del navegador cuando el dispositivo lo permite;
- migración automática de la sesión que ya existía bajo la clave `nv7-auth`.

La recuperación técnica tiene un máximo de intentos y no sustituye la validación del usuario ante Supabase. Las contraseñas no se almacenan en la aplicación.

## Actualización segura

- No desregistra el Service Worker durante una actualización normal.
- No borra cachés si la versión publicada es la misma.
- Protege y refleja la sesión antes de recargar.
- Separa **Actualizar ahora**, **Recargar interfaz** y **Reparar actualización**.
- La reparación actúa únicamente sobre cachés pertenecientes a Natura Vida.
- Muestra el estado de la sesión y de su almacenamiento en el Centro de actualizaciones.

## Aviso falso de cambios sin guardar

El mensaje observado en Inicio no provenía del navegador: era una confirmación interna basada en una bandera global. V8.4.0 limita esa bandera a formularios transaccionales reales y excluye:

- buscadores y filtros;
- campo del asistente;
- inicio de sesión;
- controles de actualización;
- controles expresamente marcados como no editables.

Cuando no existen campos realmente modificados, la bandera se limpia antes de navegar o recargar.

## Director Administrativo consolidado

Se añadió un Centro administrativo único dentro del asistente, con:

- prioridad ejecutiva actual;
- trabajos preparados pendientes;
- tareas abiertas;
- alertas críticas y altas;
- evaluación de salud del negocio;
- resumen del día;
- accesos a trabajos, tareas, alertas, evaluación y resumen.

Ninguna operación se ejecuta automáticamente: continúa requiriendo revisión y aprobación.

## Compatibilidad y despliegue

- Repositorio: 99 archivos.
- No requiere migración SQL nueva.
- Mantiene la migración V8.3.4 para tareas y estados sincronizados.
- No requiere desplegar nuevamente la Edge Function, porque esta versión no modifica el contrato del motor externo.

## Alcance de la validación

Las verificaciones incluidas son locales y estáticas, con una simulación del adaptador de almacenamiento. La persistencia definitiva debe comprobarse en el teléfono después de publicar, debido a que el comportamiento real también depende del navegador Android, la instalación PWA, la red y la configuración productiva de Supabase.
