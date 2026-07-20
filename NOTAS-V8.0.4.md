# Natura Vida V8.0.4 — Saneamiento, seguridad y estabilidad general

## Implementado
- Centro administrativo **Estado del sistema** desde Configuración.
- Diagnóstico de conexión, Supabase, sesión, versión, duplicados e inventario.
- Detección preventiva de clientes posiblemente duplicados por nombre o teléfono.
- Revisión básica de stock, precios y costos anómalos, sin corrección automática.
- Identificación visual de posibles usuarios demo, perfiles incompletos y cantidad de registros vinculados.
- Copia JSON de consulta de los datos autorizados y cargados en la sesión.
- Registro de auditoría al generar la copia, cuando la función de auditoría está disponible.
- Diseño móvil y estados verde, naranja y rojo.

## Protección de datos
Esta versión no fusiona clientes, no ajusta stock y no elimina usuarios automáticamente. Esas operaciones requieren revisión humana y, para eliminar cuentas de Authentication, una función administrativa segura del servidor.

## Pruebas
- Auditoría general: 127/127.
- Regresión territorial: 9/9.
- Despliegue: 18/18.
- Saneamiento V8.0.4: 12/12.
