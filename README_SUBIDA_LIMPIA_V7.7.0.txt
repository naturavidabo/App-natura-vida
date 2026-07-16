NATURA VIDA V7.7.0 — SUBIDA LIMPIA A GITHUB
Personal, mano de obra, Centro de Gestión y Realtime estable

IMPORTANTE
Este paquete contiene únicamente el sitio web. No contiene archivos SQL.
Los SQL se ejecutan exclusivamente en Supabase SQL Editor y nunca deben
renombrarse ni subirse como index.html.

ORDEN DE INSTALACIÓN

1. En Supabase > SQL Editor, ejecuta:
   01_V7.7.0_PERSONAL_CENTRO_GESTION.sql

2. Cuando aparezca Success, ejecuta:
   02_V7.7.0_VERIFICAR.sql

3. Confirma que todos los controles del verificador indiquen OK.

4. En GitHub, realiza la subida limpia prevista:
   - Borra los archivos anteriores del repositorio, excepto la configuración
     del repositorio que necesites conservar.
   - Extrae este ZIP en tu computadora.
   - Sube el CONTENIDO EXTRAÍDO, manteniendo las carpetas css, js, icons, img,
     tests y .github.
   - No subas el ZIP como único archivo.
   - No subas ninguno de los SQL al repositorio.

5. Antes de confirmar, abre index.html en GitHub. La primera línea debe ser:
   <!DOCTYPE html>

6. Espera a que GitHub Actions finalice en verde.

7. Abre la aplicación y fuerza la actualización:
   Más > Administración/Configuración > Actualizaciones > Actualizar ahora.
   En computadora también puedes usar Ctrl + F5.

8. PRUEBAS MÍNIMAS DESPUÉS DE PUBLICAR
   - Ingresar como administrador y como representante.
   - Verificar que el representante vea Mis grupos de precio y no los grupos
     centrales como grupos propios de sus clientes.
   - Abrir Ventas y comprobar que Catálogo esté visible entre las herramientas
     comerciales.
   - Abrir Más y revisar el Centro de Gestión por categorías.
   - Crear una persona, una tarea y una asistencia de prueba.
   - Abrir Distribución y rutas; comprobar que las actualizaciones no hagan
     parpadear o reconstruir toda la pantalla.
   - Confirmar que el mapa conserve la ruta abierta y la posición de pantalla.

NOTA TÉCNICA
Las comprobaciones incluidas validan estructura, sintaxis, versiones,
empaquetado y ausencia de SQL en el sitio. Las operaciones autenticadas de
Supabase, GPS, almacenamiento de fotografías y RLS deben probarse en el
proyecto real con cuentas de administrador y representante.
