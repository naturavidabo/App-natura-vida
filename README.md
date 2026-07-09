# Natura Vida V7.2.0 estabilizada

Aplicación PWA estática conectada a Supabase. GitHub Pages publica únicamente los archivos de la aplicación mediante el workflow `.github/workflows/deploy-pages.yml`.

## Despliegue

1. En **Settings → Pages**, seleccionar **GitHub Actions** como fuente.
2. Ejecutar primero en Supabase `sql/2026-07-09_v7_2_0_stabilization.sql`.
3. Subir estos archivos a la raíz de `main`.
4. El workflow valida la aplicación, crea una carpeta `_site` limpia y despliega con acciones compatibles con Node.js 24.

No se publican las carpetas `sql`, `tests` ni la documentación dentro del sitio web.
