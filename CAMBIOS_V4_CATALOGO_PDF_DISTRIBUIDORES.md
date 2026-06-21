# NATURA VIDA V4 - Catálogo PDF e intercambio inteligente

## Objetivo
Complementar la app para el modelo real de trabajo:

Administrador central -> representantes regionales -> tiendas / mercados / clientes finales.

## Nuevo módulo: Catálogo PDF para WhatsApp

Se agregó una opción en **Más -> Catálogo PDF para WhatsApp**.

Permite generar un PDF con:
- nombre del producto;
- fotografía;
- categoría;
- descripción;
- precio público;
- stock referencial opcional;
- contacto o WhatsApp de pedidos.

El PDF no muestra costos internos. El precio revendedor interno solo puede incluirse si se marca manualmente desde una sesión de administrador.

## Nuevo módulo: Intercambio inteligente

Se agregó una opción en **Más -> Intercambio inteligente**.

Funciones iniciales:

### Administrador
- Exportar catálogo general para representantes.
- Importar reporte parcial de representante.

### Representante
- Importar catálogo/actualización recibida.
- Exportar reporte parcial para el administrador.

## Paquetes inteligentes

Los archivos `.json` ahora pueden tener tipo:
- `catalog_update`: actualización de catálogo, precios, fotos y descripción.
- `representative_report`: reporte parcial de ventas e inventario de representante.

Cada paquete incluye:
- ID único;
- fecha de creación;
- origen;
- destino;
- tipo de paquete.

La app detecta si un paquete ya fue importado para evitar duplicados.

## Ventas por canal

En el panel de venta del administrador se reemplazó la lógica simple por canales:

- Venta unitaria.
- Venta mayorista mercado.
- A representante.

El canal “A representante” ya queda registrado como tipo separado para continuar con la generación de despacho inteligente.

## Archivos modificados
- `index.html`
- `service-worker.js`
- `css/app.css`
- `js/db.js`
- `js/app.js`
- `js/sales.js`

## Archivos nuevos
- `js/catalog-pdf.js`
- `js/smart-packages.js`

## Nota importante
La PWA no puede abrir automáticamente archivos recibidos por WhatsApp sin intervención del usuario, por seguridad del navegador/celular. El flujo correcto es:

1. Recibir archivo por WhatsApp.
2. Guardarlo o abrirlo desde descargas.
3. Entrar a la app.
4. Tocar **Más -> Intercambio inteligente**.
5. Seleccionar el archivo.
6. La app detecta el tipo de paquete y pregunta si se desea aplicar.

## Siguiente paso recomendado
Implementar V4.2:

- creación de representantes desde el administrador;
- generación de despacho a representante con archivo inteligente;
- importación de despacho que aumente inventario regional;
- reporte consolidado por representante;
- historial de paquetes enviados/recibidos.
