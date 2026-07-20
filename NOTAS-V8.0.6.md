# Natura Vida V8.0.6

## Respaldo, auditoría y calidad de datos

Esta versión conserva la continuidad segura de V8.0.5 y agrega un centro administrativo para revisar la calidad de la información antes de incorporar reglas comerciales avanzadas e inteligencia artificial.

### Implementado

- Respaldo JSON verificable de los datos autorizados cargados desde Supabase.
- Manifiesto con cantidades por sección y huella SHA-256.
- Historial local de metadatos de respaldos, sin almacenar la copia dentro de la aplicación.
- Validación de archivos y simulación comparativa sin modificar la base real.
- Restauración real bloqueada en el navegador por seguridad.
- Visor de auditoría con eventos disponibles en Supabase y en la sesión.
- Exportación CSV de auditoría y observaciones.
- Detección preventiva de clientes duplicados, teléfonos repetidos y coordenadas inválidas.
- Revisión de productos, costos, precios, stock y SKU repetidos.
- Detección de ventas potencialmente duplicadas, cantidades inválidas y referencias huérfanas.
- Revisión de movimientos de inventario, identificadores repetidos y rupturas de secuencia cuando existen saldos antes/después.
- Identificación y bloqueo seguro de posibles usuarios demo, sin eliminar historial.
- Revisión de borradores locales antiguos o creados en otra versión.

### Protección

- No elimina usuarios.
- No fusiona clientes automáticamente.
- No corrige inventario automáticamente.
- No restaura la base desde el navegador.
- No introduce cola offline.
- No exporta contraseñas, tokens ni secretos.

### Alcance técnico

El respaldo generado desde la PWA contiene únicamente los registros que el usuario administrador tiene autorizados y que han sido cargados en la sesión. No reemplaza una copia administrada del proyecto Supabase. La lectura remota de auditoría depende de que la tabla `audit_log` y sus políticas RLS permitan consulta al administrador central; si no, el sistema muestra los eventos disponibles localmente.
