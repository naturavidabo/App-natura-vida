# Control de Presupuesto B5.2 — Corrección de compatibilidad con Microsoft Excel

## Error confirmado

Microsoft Excel reportaba que debía reparar el archivo y señalaba:

- `/xl/worksheets/sheet1.xml`
- error de carga en la línea correspondiente a `autoFilter`

La hoja contenía el elemento `autoFilter` después de `mergeCells`. Ese orden no era válido para la estructura esperada por Microsoft Excel. Como consecuencia, Excel podía descartar o reemplazar la hoja completa durante la reparación, haciendo que pareciera que categorías y montos no existían.

## Corrección aplicada

- Se eliminó `autoFilter` de la hoja exportada. El filtro no era necesario para conservar ni mostrar los registros.
- Se mantuvieron los datos como celdas reales:
  - categoría y detalle como texto;
  - monto como valor numérico;
  - fecha, hora, proyecto y mes en columnas separadas.
- Se actualizó la identificación visual y la caché a B5.2.
- No se modificó IndexedDB, la migración, los respaldos JSON ni los gastos guardados.

## Verificación

- Archivo ZIP XLSX íntegro.
- Todos los XML internos analizados correctamente como XML bien formado.
- Archivo importado nuevamente con una biblioteca de hojas de cálculo sin reparación.
- Filas, categorías y montos recuperados de la hoja exportada.

