# Control de Presupuesto B5.2

Aplicación PWA local para gastos, presupuestos y proyectos.

## Publicación en GitHub Pages

1. Descomprimir el paquete.
2. Subir todos los archivos de esta carpeta a la raíz del repositorio.
3. Conservar la misma dirección de GitHub Pages utilizada por la B4 para que la migración local pueda encontrar los datos antiguos.
4. Esperar a que `pages build and deployment` termine en verde.
5. Abrir la dirección en Chrome y actualizar una vez.
6. Ingresar el código de activación.
7. Abrir Configuración → Estado de los datos → Comprobar integridad.
8. Crear un respaldo completo JSON.

## Archivos necesarios para la app

- `index.html`
- `app.js`
- `styles.css`
- `manifest.json`
- `sw.js`
- `.nojekyll`
- `icon-v5.svg`
- `icon-192-v5.png`
- `icon-512-v5.png`

Los documentos Markdown son informativos y no afectan el funcionamiento.


## Correcciones B5.1 y B5.2

- La exportación ahora genera un archivo `.xlsx` real, no un CSV.
- Incluye número, fecha, hora, categoría, detalle, monto numérico, proyecto y mes.
- Valida todos los registros antes de descargar el archivo y muestra cantidad y total exportado.
- Respeta el mes y la búsqueda seleccionados en Historial.


### Corrección B5.2

- Se corrigió la estructura XML de la hoja de Excel.
- Se eliminó el elemento `autoFilter` que estaba ubicado en un orden no válido dentro de `sheet1.xml` y provocaba que Microsoft Excel reparara o descartara la hoja.
- La exportación conserva categorías, detalles, montos numéricos, proyectos y fechas.
- No se modifica IndexedDB ni el sistema de respaldo financiero.
