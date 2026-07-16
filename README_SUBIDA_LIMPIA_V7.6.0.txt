NATURA VIDA V7.6.0 — SUBIDA LIMPIA A GITHUB

ESTE ZIP CONTIENE SOLO EL SITIO WEB Y LOS ARCHIVOS DE DESPLIEGUE.
NO CONTIENE ARCHIVOS SQL.

ORDEN RECOMENDADO
1. Antes de tocar GitHub, ejecuta en Supabase el archivo 01_V7.6.0_DISTRIBUCION_Y_RUTAS.sql.
2. Ejecuta después 02_V7.6.0_VERIFICAR.sql y confirma que todos los resultados sean OK.
3. En GitHub, borra los archivos anteriores del repositorio, como indicaste.
4. Extrae este ZIP en tu computadora.
5. Sube EL CONTENIDO de la carpeta extraída, no el ZIP cerrado ni una carpeta adicional.
6. Conserva exactamente los nombres y carpetas: index.html, css, js, img, icons, tests y .github.
7. Antes de confirmar, abre index.html en GitHub. Su primera línea debe ser: <!DOCTYPE html>
8. El index.html nunca debe comenzar con -- NATURA VIDA, SELECT, CREATE TABLE o CREATE POLICY.
9. Espera a que GitHub Actions finalice en verde.
10. Abre la app y fuerza la actualización desde Más > Actualizaciones; en PC también puedes usar Ctrl+F5.

IMPORTANTE
- Los dos archivos SQL se ejecutan únicamente en Supabase SQL Editor.
- Nunca renombres un SQL como index.html.
- Este paquete separa físicamente el sitio web de los SQL para evitar repetir el error de la V7.5.0.
