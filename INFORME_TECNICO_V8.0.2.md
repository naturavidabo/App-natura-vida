# Natura Vida V8.0.2

## Experiencia premium, búsqueda inteligente y territorio operativo

Fecha de compilación: 18 de julio de 2026  
Canal: estable  
Base conservada: Natura Vida V8.0.1

## Objetivo

Esta versión consolida la estabilización funcional y el rediseño visual solicitados para Inicio, Más, Territorio, registro de clientes, edición de precios y recibos. Mantiene la arquitectura, navegación, datos y funciones de acceso, roles y vendedores vinculados de V8.0.1.

## Cambios implementados

### 1. Inicio / panel central

- Encabezado ejecutivo con mayor presencia del usuario y badge premium para el rol.
- Tarjetas de Ventas, Pedidos, Productos y Notificaciones con iconografía moderna, cifras más visibles y mejor contraste.
- Actividad reciente con estado «En tiempo real», resumen operativo y diferenciación visual de eventos.
- Tipografía, espaciado, sombras y jerarquía visual actualizados sin cambiar la estructura principal.

### 2. Pantalla Más

- Rediseño de las fichas Comercial, Operaciones, Territorio, Personal y funciones, Finanzas y Administración.
- Ilustraciones vectoriales integradas en cada tarjeta; se eliminaron los iconos pequeños de apariencia antigua.
- Títulos, descripciones y contadores con mejor tamaño, contraste y uso del espacio.
- Identidad cromática propia por módulo y conservación del orden de navegación existente.

### 3. Territorio y mapa

- Controles compactos: Mi ubicación, Marcar punto y Capas.
- Densidad territorial funcional mediante capa visual, leyenda y selección de fuente: actividad, clientes, prospectos o visitas.
- Buscador combinado de registros internos y calles/lugares mediante Nominatim.
- Sugerencias diferenciadas por tipo de resultado y apertura directa del marcador o ubicación.
- Adaptación del mapa mientras se escribe para reducir interferencias del teclado.
- Conservación de centro, zoom, filtros, popups y contexto durante actualizaciones.
- Mensajes específicos para permiso de ubicación, GPS no disponible y tiempo agotado.
- Los mosaicos cartográficos continúan sin caché defectuosa y con proveedor alternativo.

### 4. Clientes y prevención de duplicados

- Autocompletado desde dos caracteres en formulario de clientes y pantallas de venta.
- Coincidencias por nombre, nombre comercial, alias, teléfono, ciudad, dirección y ubicación.
- Comparación aproximada para detectar pequeñas variaciones de escritura.
- Sugerencias compactas con nombre, teléfono, zona o tipo de cliente.
- Confirmación antes de crear un cliente con teléfono igual o nombre muy parecido.
- Posibilidad de seleccionar el cliente existente o continuar creando uno nuevo.

### 5. Edición de precios

- El naranja suave se consolida como código visual de edición manual.
- Campos de tipo de ajuste, valor y precio final claramente identificados.
- Productos agregados a la venta muestran el precio como zona editable sin colorear toda la tarjeta.
- El estado «Modificado», el botón de edición y el campo editable mantienen coherencia visual.

### 6. Recibo

- QR ampliado de 160 a 210 píxeles dentro del lienzo.
- Desactivación de suavizado al dibujar el QR para conservar módulos nítidos.
- Etiqueta única: «QR de pago».
- Mensaje corregido: «Gracias por su compra. Escanee el código QR para realizar el pago.»
- Eliminación de «próximos pagos o consultas», «QR de cobro» y agradecimientos repetidos.
- Cierre único de marca: «Gracias por confiar en Natura Vida Bolivia.»
- Aumento moderado de tipografía y mejor distribución del total.

## Estabilidad y compatibilidad

- No se modificaron los identificadores ni la lógica transaccional de ventas existentes.
- Se preservaron los RPC y estructuras de V8.0.1 para sesión, roles, stock vinculado y venta atómica.
- Se actualizaron manifest, service worker, control de versión y parámetros de caché a 8.0.2.
- No se incluyen archivos SQL ni respaldos `.bak` en el paquete final.

## Validaciones ejecutadas

- Sintaxis correcta en los 38 archivos JavaScript mediante `node --check`.
- JSON válido en `app-version.json` y `manifest.json`.
- CSS con llaves balanceadas.
- Auditoría funcional V8.0.2: 117/117 controles aprobados.
- Auditoría de despliegue GitHub Pages: 17/17 controles aprobados.
- Prueba unitaria de autocompletado de clientes: 4/4 controles aprobados.

## Archivos principales modificados

- `css/v8.css`
- `js/v7-shell.js`
- `js/v7-management-center.js`
- `js/v8-territory.js`
- `js/clients.js`
- `js/sales.js`
- `js/v7-inventory-sales.js`
- `js/v7-documents.js`
- `js/app-update.js`
- `index.html`
- `manifest.json`
- `app-version.json`
- `service-worker.js`
