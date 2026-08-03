NATURA VIDA V8.4.0 — DIRECTOR ADMINISTRATIVO Y SESIÓN PERSISTENTE

1. Reemplaza en GitHub el contenido de la versión anterior por los 99 archivos de este paquete.
2. Espera que GitHub Actions termine la publicación.
3. Cierra completamente la PWA V8.3.5 y vuelve a abrirla.
4. Confirma que en Actualizaciones aparezca V8.4.0.
5. Inicia sesión una sola vez si la transición desde la versión antigua no conserva la sesión. Desde ese ingreso, V8.4.0 migrará la sesión a la nueva doble persistencia.
6. En Ajustes > Continuidad de sesión, comprueba que indique "Persistente reforzada" o "Doble copia local".

NO REQUIERE:
- Nueva migración SQL.
- Volver a desplegar la Edge Function.

DEBE PERMANECER APLICADA:
- La migración V8.3.4 del Centro Ejecutivo sincronizado.

IMPORTANTE:
- La primera carga de V8.4.0 todavía puede ser iniciada por el actualizador de la versión anterior. Después de cargar V8.4.0, la actualización normal ya no desregistra la PWA ni recarga cuando no existe una versión más nueva.
- El botón Reparar actualización limpia únicamente cachés de Natura Vida y protege primero la sesión.
