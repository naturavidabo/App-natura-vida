# Natura Vida V8.2.2 — Informe técnico

## Nombre de la versión
**Asistente IA operativo seguro, acciones confirmadas y afinación móvil**

## Objetivo
Corregir los desbordamientos visibles en el Asistente IA y en el Estado de cuenta, mejorar la lectura en celulares y avanzar el asistente hacia acciones útiles sin permitir ejecuciones automáticas.

## Correcciones de interfaz
- Asistente contenido dentro del ancho real del celular.
- Tarjetas numéricas de dos columnas con anchos flexibles.
- Recomendaciones, pestañas, mensajes y respuestas sin cortes laterales.
- Tablas del asistente con desplazamiento horizontal interno, sin ensanchar toda la aplicación.
- Compositor por encima de la barra inferior y mayor espacio de cierre.
- Estado de cuenta con encabezado, datos del cliente, botones y métricas responsivos.
- Acciones financieras organizadas en cuadrícula móvil.
- El botón flotante del asistente se oculta en Estado de cuenta para no cubrir información.
- Se añadió el botón **Analizar con IA** dentro de la propia ficha financiera.

## Siguiente nivel del asistente
El asistente ahora puede presentar **Acciones con confirmación** después de un análisis:
- abrir el módulo relacionado;
- preparar un mensaje de seguimiento;
- preparar un mensaje de cobro;
- generar un recibo consolidado;
- abrir el registro de pago;
- abrir una cotización prellenada;
- abrir reglas comerciales para revisar descuentos y márgenes.

Ninguna acción se ejecuta de forma silenciosa. Siempre se abre una pantalla de revisión y el administrador debe confirmar.

## Contexto financiero
Desde el Estado de cuenta, el asistente recibe un resumen seguro del cliente visible:
- total comprado;
- total pagado;
- saldo pendiente;
- operaciones pendientes;
- deuda más antigua;
- último pago;
- días de atraso.

Los teléfonos permanecen locales y no se envían al motor externo. Solo se utilizan en el dispositivo cuando el administrador decide abrir WhatsApp.

## Motor IA
Se conserva la arquitectura:
`PWA → Supabase Edge Function nv-ai-assistant → Gemini`

El motor local continúa siendo la fuente verificable para cálculos. Gemini interpreta el resumen empresarial cuando la Edge Function y la clave están configuradas. La respuesta estructurada puede sugerir áreas y acciones, pero la aplicación valida lo permitido.

## Seguridad
- Acceso exclusivo al administrador central.
- Sin escritura automática de ventas, pagos, inventario, precios o promociones.
- Clave Gemini solo en Supabase Secrets.
- Auditoría de acciones confirmadas sin guardar el contenido completo de la conversación.
- Conversación e historial de acciones guardados localmente por usuario.
- La antigua cola offline automática continúa deshabilitada.

## Archivos
No se añadieron archivos nuevos. Se modificaron archivos existentes y el repositorio final conserva **97 archivos**, por debajo del límite de 100.
