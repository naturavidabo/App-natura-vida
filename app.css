# Guía corregida de despliegue — GitHub Pages / Node.js 24

## Diagnóstico del fallo observado

El error **“The job was not acquired by Runner of type hosted even after multiple attempts”** ocurrió antes de iniciar los pasos del workflow. No fue causado por el código de Natura Vida: fue una incidencia de los runners alojados por GitHub.

La advertencia **“Node.js v20 is deprecated”** sí correspondía a una acción antigua usada por el flujo automático `pages-build-deployment`. Esta entrega incluye un workflow propio actualizado.

## Orden correcto

### 1. Supabase

Con una instalación que ya funciona en V7.3.0, ejecutar:

1. `sql/2026-07-15_v7_4_0_production.sql`
2. `sql/2026-07-15_v7_4_0_verify.sql`

En una instalación nueva o incompleta, respetar este orden:

1. `sql/2026-07-09_v7_2_0_stabilization.sql`
2. `sql/2026-07-15_v7_3_0_representative_pricing.sql`
3. `sql/2026-07-15_v7_4_0_production.sql`
4. `sql/2026-07-15_v7_4_0_verify.sql`

V7.2 corrige la auditoría de ventas; V7.3 consolida precios de representantes; V7.4 crea producción, insumos, lotes y costos.

### 2. GitHub Pages

1. Entra al repositorio `App-natura-vida`.
2. Ve a **Settings → Pages**.
3. En **Build and deployment → Source**, selecciona **GitHub Actions**.
4. Guarda el cambio.
5. Cancela ejecuciones antiguas que sigan en **Queued**.
6. Reemplaza los archivos del repositorio con el contenido de este paquete.
7. Haz commit en la rama `main`.
8. En **Actions**, abre **Deploy Natura Vida to GitHub Pages**.
9. Deben ejecutarse dos trabajos: **Validate and package** y **Deploy**.

## Acciones actualizadas

- `actions/checkout@v6`
- `actions/configure-pages@v6`
- `actions/upload-pages-artifact@v5`
- `actions/deploy-pages@v5`

El workflow publica una carpeta `_site` limpia. SQL, pruebas e informes permanecen en el repositorio, pero no quedan expuestos en la página publicada.

## Si el despliegue vuelve a quedar en cola

1. Revisa GitHub Status.
2. Cancela el run antiguo.
3. Abre el workflow y pulsa **Run workflow**.
4. No vuelvas a cambiar la aplicación ni Supabase por un error de runner que ocurre antes de los logs.
