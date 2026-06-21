# NATURA VIDA V4.1 - Catálogo premium y compartir inmediato

## Objetivo
Pulir el área de catálogo y ventas para que la aplicación sea útil en la calle, en la universidad o durante una visita comercial, sin tener que buscar manualmente el archivo en el administrador de archivos.

## Cambios principales

### 1. Catálogo PDF premium
Se rediseñó el catálogo PDF con identidad visual Natura Vida:
- logo corporativo incluido;
- portada comercial;
- colores verdes naturales y acento naranja/dorado;
- diseño más atractivo para WhatsApp;
- tarjetas de producto con foto, categoría, descripción y precio;
- cierre con contacto/WhatsApp.

### 2. Flujo generar + previsualizar + compartir
Después de generar el catálogo, la app ahora muestra una pantalla de resultado con:
- confirmación visible de PDF creado;
- vista previa integrada;
- botón Compartir;
- botón Previsualizar;
- botón Descargar.

En celulares compatibles, el botón Compartir usa el menú del sistema para enviar el PDF por WhatsApp u otras aplicaciones.

### 3. Mejora del área de ventas
Se mejoró la presentación del módulo Vender:
- cabecera comercial;
- tarjetas de productos más prolijas;
- categoría visible;
- descripción breve;
- precio más destacado;
- mejor estilo de botones y selector de cantidades.

### 4. Cambio de texto
Se quitó la palabra "mercado" en el selector principal. Ahora queda:
- Unitaria
- Mayorista
- Representantes

### 5. Archivos de marca
Se agregaron imágenes de identidad:
- `img/brand/natura-vida-logo.jpeg`
- `img/brand/natura-vida-perfil-hojas.jpeg`

### 6. PWA
Se actualizó la versión de caché del service worker para forzar actualización visual.

## Archivos modificados
- `js/catalog-pdf.js`
- `js/sales.js`
- `js/app.js`
- `js/state.js`
- `css/app.css`
- `service-worker.js`

## Archivos nuevos
- `img/brand/natura-vida-logo.jpeg`
- `img/brand/natura-vida-perfil-hojas.jpeg`
- `CAMBIOS_V4_1_CATALOGO_PREMIUM_COMPARTIR.md`
