# Despliegue importante — NATURA VIDA PWA

## Lo que sí estaba pasando
La advertencia vista en GitHub Actions sobre Node.js 20 **no impide** el despliegue. Es solo una advertencia deprecada.

## Por qué podías seguir viendo la versión vieja
1. La PWA usa **service worker**, por lo que puede quedarse con archivos viejos en caché.
2. En GitHub Pages debes reemplazar **todos** los archivos modificados, no solo uno.
3. Si el deploy se hizo pero el navegador conserva la versión anterior, parece que “no cambió nada”.

## Archivos que debes subir o reemplazar
- `index.html`
- `service-worker.js`
- `css/app.css`
- `js/db.js`
- `js/state.js`
- `js/auth.js`
- `js/app.js`
- y mantener el resto de la carpeta del proyecto.

## Credenciales iniciales
- **Administrador**
  - usuario: `admin`
  - contraseña: `NaturaVida2026!`

- **Revendedor demo**
  - usuario: `revendedor1`
  - contraseña: `Revende2026!`

## Pasos para ver la nueva versión en vivo
1. Reemplaza los archivos del repositorio por esta versión.
2. Haz commit y push.
3. Espera que GitHub Pages termine el deploy.
4. Abre la app publicada.
5. Presiona `F12` → `Application` → `Service Workers` → `Unregister`.
6. Luego en `Storage` o `Clear storage` borra los datos del sitio.
7. Recarga con `Ctrl + F5`.

## Resultado esperado
- Se mostrará una pantalla de login.
- Verás una interfaz más moderna y marcada.
- Aparecerán botones más refinados y navegación renovada.
