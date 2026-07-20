# Informe técnico — Natura Vida V8.0.7

## Objetivo

Añadir reglas comerciales deterministas y auditables para proteger costo, margen y descuentos; preparar la base que posteriormente consultará el asistente de IA; y reducir el indicador de conexión a una cápsula mínima.

## Implementación

### Módulo `js/v8-commercial-rules.js`

- Normaliza y persiste la configuración comercial en `AppState.settings`.
- Calcula costo real, margen y precio mínimo.
- Aplica límites de descuento por rol.
- Evalúa precios finales y valida líneas completas de venta.
- Administra promociones con alcance y vigencia.
- Incluye simulador de utilidad.
- Expone funciones reutilizables para ventas, productos y grupos de precio.

### Integraciones

- `products.js`: precio mínimo autorizado opcional por producto.
- `pricegroups.js`: impide crear grupos con descuentos superiores al rol.
- `sales.js`: valida edición de precio, beneficios, checkout y registro final.
- `v7-inventory-sales.js`: aplica las mismas reglas a representantes y vendedores vinculados.
- `settings.js`, `app.js`, `v7-shell.js` y `v7-management-center.js`: acceso administrativo al nuevo módulo.
- `state.js`: valores predeterminados y promociones persistentes.

### Estado de conexión

- `v8-offline-continuity.js` reutiliza `#cloudStatusBadge`.
- Los actualizadores de cabecera conservan la clase compacta.
- El banner anterior se oculta mediante CSS.
- No se muestra texto secundario permanente.

## Despliegue seguro

La política comercial queda desactivada por defecto. Esto evita introducir un bloqueo inesperado en precios históricos. El administrador la activa después de revisar la información real.

## Seguridad

- Configuración disponible únicamente para administrador central.
- Los límites se aplican según el rol de quien vende.
- Las excepciones requieren rol central, confirmación y motivo.
- Las promociones no pueden superar el máximo global.
- Ninguna función de IA está activa en esta versión.

## Validaciones automáticas

- Sintaxis de todos los archivos JavaScript.
- Auditoría general del sitio.
- Despliegue GitHub Pages.
- Regresión territorial y autocompletado.
- Continuidad segura y calidad de datos.
- Pruebas unitarias del motor de margen y descuento.
- Prueba de integración comercial.
- Prueba específica de la cápsula de conexión.

## Limitación de la validación

Las pruebas automatizadas verifican lógica, sintaxis e integración estática. La conexión real, políticas RLS y escritura en Supabase deben confirmarse en el proyecto publicado con las cuentas y roles reales.
