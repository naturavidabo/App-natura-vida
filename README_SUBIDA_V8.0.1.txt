NATURA VIDA V8.0.1 XD — ACCESO CONFIABLE, VENDEDORES VINCULADOS Y MAPA ESTABLE
================================================================================

PAQUETE
- Este ZIP contiene únicamente el sitio web para GitHub Pages.
- No contiene archivos SQL.
- No contiene contraseñas privadas ni claves service_role.
- index.html debe quedar directamente en la raíz del repositorio.

INSTALACIÓN
1. En Supabase SQL Editor ejecutar:
   01_V8.0.1_ACCESO_VENDEDORES_MAPA_ESTABLE.sql
2. Ejecutar después:
   02_V8.0.1_VERIFICAR.sql
3. Todos los controles del verificador deben indicar OK.
4. Extraer el ZIP del sitio en la computadora.
5. En GitHub usar Add file > Upload files.
6. Arrastrar todo el contenido extraído, no el archivo ZIP.
7. Reemplazar los archivos existentes y confirmar el cambio.
8. Esperar GitHub Actions en verde.
9. Abrir Natura Vida y usar Más > Administración > Actualizaciones > Actualizar ahora.

PRUEBA CONTROLADA RECOMENDADA
- Cerrar y volver a abrir la aplicación: la sesión debe conservarse.
- Registrar una cuenta de prueba y comprobar la pantalla de confirmación.
- Probar Abrir Gmail y Reenviar confirmación.
- Asignar la cuenta como Vendedor vinculado.
- Definir propietario de stock y, opcionalmente, un punto de venta.
- Realizar una venta pequeña y verificar el descuento del stock correcto.
- Abrir Territorio: deben verse calles; probar Mi ubicación, búsqueda, punto manual y pantalla completa.

NOTAS
- El vendedor vinculado no compra inventario ni modifica cantidades o costos.
- Un punto de venta representa producto en custodia: no es venta, deuda ni cambio de propietario.
- Las operaciones críticas siguen siendo online-first y deben confirmarse en Supabase.
- El mapa necesita internet para descargar las calles, aunque el GPS del teléfono pueda obtener coordenadas.
