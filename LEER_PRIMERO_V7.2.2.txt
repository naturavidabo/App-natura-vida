# Guía de despliegue — Natura Vida V7.2.0

## Orden correcto

### 1. Ejecutar la migración en Supabase

1. Entrar al proyecto de Supabase que utiliza la aplicación.
2. Abrir **SQL Editor**.
3. Crear una consulta nueva.
4. Copiar todo el contenido de:
   `sql/2026-07-09_v7_2_0_stabilization.sql`
5. Ejecutar la consulta.
6. Confirmar que al final aparezca la columna `user_id` y el bucket `payment-assets`.

No publicar primero para “probar suerte”: la causa actual de la venta está en la base de datos.

### 2. Publicar el código en GitHub

1. Conservar una copia del repositorio actual.
2. Reemplazar sus archivos por el contenido de esta carpeta V7.2.0.
3. Confirmar que `index.html` esté en la raíz de la rama publicada.
4. Subir y confirmar los cambios en GitHub.
5. Esperar a que GitHub Pages termine el despliegue.

### 3. Aplicar la actualización en el teléfono

1. Abrir la aplicación con internet.
2. Ir a **Más → Actualizaciones**.
3. Pulsar **Buscar actualización**.
4. Pulsar **Actualizar ahora**.
5. Comprobar que muestre **V7.2.0**.

Si el teléfono tenía una versión muy antigua que todavía no contiene el nuevo botón, abrir una vez la dirección de GitHub Pages en Chrome y recargar. Después de entrar a V7.2.0, las siguientes actualizaciones se administrarán desde la aplicación.

## Prueba crítica inicial

Realizar primero una venta de prueba de una unidad y revisar:

- que desaparezca el error `audit_log.user_id`;
- que solo exista una venta;
- que el stock baje exactamente una unidad;
- que el recibo se genere;
- que el historial muestre la operación.

Después ejecutar la matriz completa incluida en `AUDITORIA_V7.2.0.md`.
