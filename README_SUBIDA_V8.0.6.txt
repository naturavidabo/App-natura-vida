NATURA VIDA V8.0.6 — RESPALDO, AUDITORÍA Y CALIDAD DE DATOS

1. Descomprime este ZIP.
2. Sube el contenido de la carpeta raíz al repositorio GitHub, rama main.
3. No subas la carpeta contenedora como un nivel adicional.
4. Espera que GitHub Actions ejecute todas las pruebas.
5. Abre la aplicación y usa Más > Actualizaciones > Actualizar ahora.
6. Ingresa como administrador central.
7. Ve a Configuración > Respaldo y auditoría.

PRUEBAS RECOMENDADAS DESPUÉS DE PUBLICAR
- Crear un respaldo verificable y guardar el JSON fuera del celular.
- Validar el mismo archivo: debe indicar huella correcta.
- Comprobar que la simulación no modifica datos.
- Revisar observaciones de clientes, productos, ventas e inventario.
- Abrir auditoría y confirmar si Supabase permite leer audit_log.
- Bloquear un usuario demo únicamente después de revisar su actividad.

IMPORTANTE
- Esta versión no borra usuarios ni restaura la base automáticamente.
- El respaldo de la PWA contiene los datos autorizados cargados en la sesión.
- Supabase sigue siendo la fuente oficial.
- No existe cola offline automática.
