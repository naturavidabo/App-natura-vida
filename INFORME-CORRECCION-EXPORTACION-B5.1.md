# Control de Presupuesto B5.1 — Corrección de exportación Excel

## Problema confirmado

La B5 exportaba un archivo CSV y mostraba el mensaje de éxito sin comprobar que las columnas de categoría, detalle y monto quedaran correctamente representadas al abrirse en Excel. Además, el monto se escribía como texto con coma decimal, lo cual podía interpretarse de manera distinta según la configuración regional de Excel.

## Corrección aplicada

- Se reemplazó la exportación CSV por un archivo `.xlsx` real generado localmente y sin internet.
- El archivo contiene una hoja llamada `Gastos`.
- Columnas: número, fecha, hora, categoría, detalle, monto numérico en bolivianos, proyecto y mes.
- El monto se escribe como número de Excel, no como texto.
- Se agregan periodo exportado, cantidad de registros y total gastado.
- La exportación respeta el mes y la búsqueda aplicados en Historial.
- Antes de descargar se validan fechas y montos. Si existe un registro inválido, la descarga se bloquea y se informa el problema.
- Después de generar el archivo, la aplicación informa cuántos gastos y qué total fueron exportados.
- Se añadieron equivalencias para leer nombres de campos antiguos (`monto`, `detalle`, `fecha`, etc.) si existieran por una migración anterior.

## Pruebas ejecutadas

1. Validación de sintaxis de `app.js` y `sw.js`.
2. Validación de `manifest.json`.
3. Generación de un `.xlsx` de prueba con tres gastos.
4. Verificación de la estructura ZIP interna del archivo Excel.
5. Verificación XML de todos los componentes principales del libro.
6. Comprobación de categorías con tildes y caracteres especiales.
7. Comprobación de montos 15,50; 2,50 y 28,00 como valores numéricos.
8. Comprobación del total exportado: Bs 46,00.
9. Comprobación de proyecto general y proyecto personalizado.
10. Renovación de la caché del Service Worker a B5.1.

## Datos financieros

Esta actualización no cambia IndexedDB, no elimina registros, no altera presupuestos y no modifica el esquema de la base. Solo corrige el módulo de exportación y renueva los archivos de interfaz en caché.
