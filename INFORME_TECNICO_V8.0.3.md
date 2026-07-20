# Natura Vida V8.0.4

## Corrección aplicada

La pantalla de registro territorial podía quedar visualmente bloqueada porque el panel de Capas del mapa tenía una prioridad de superposición mayor que la hoja del formulario. Además, la búsqueda cartográfica localizaba registros, pero no estaba conectada con el llenado del formulario territorial.

## Solución

- Prioridad visual corregida: toda hoja de formulario se muestra por encima del mapa, buscador y panel de Capas.
- Panel de Capas con cierre explícito mediante botón **Continuar**, cierre exterior y cierre automático antes de abrir formularios.
- Autocompletado de clientes reutilizando la búsqueda inteligente existente.
- Vinculación de cliente existente: rellena negocio/nombre, WhatsApp, ciudad, dirección, dato de ubicación, latitud, longitud y observaciones.
- Guardado diferenciado: un cliente seleccionado se actualiza en su propia ficha y no genera un prospecto duplicado.
- Cliente o prospecto sin GPS: desde el buscador territorial se abre el formulario correspondiente para completar su ubicación.

## Compatibilidad

No se modifica la estructura de la base de datos ni se eliminan registros existentes. La actualización conserva clientes, prospectos, ventas, inventario y configuración.
