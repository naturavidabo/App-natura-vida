# Natura Vida V8.0.1 XD
## Acceso confiable, vendedores vinculados y mapa territorial estable

**Fecha de construcción:** 18 de julio de 2026  
**Base:** Natura Vida V8.0.0 XD  
**Arquitectura:** PWA para GitHub Pages + Supabase Auth/Postgres/Realtime/Storage

## 1. Objetivo

V8.0.1 estabiliza la identidad, el acceso, el trabajo comercial delegado y el módulo territorial antes de avanzar hacia inteligencia artificial. Mantiene ventas, clientes, producción, inventario, cuentas por cobrar, rutas, personal y territorio existentes.

## 2. Acceso y sesión

- Sesión persistente y renovación automática de token.
- Recuperación de la última ficha del usuario durante fallas temporales.
- Pantalla “Restaurando tu sesión” en lugar de solicitar nuevamente la contraseña.
- Cierre de sesión solo por acción explícita o evento real de autenticación.
- Pantalla persistente de confirmación de correo.
- Abrir Gmail, reenviar confirmación, cambiar correo y volver al acceso.
- Temporizador para evitar reenvíos repetidos.

## 3. Vendedor vinculado

El nuevo rol vende utilizando el inventario de un responsable asignado. No compra producto, no genera deuda por adquisición y no modifica stock ni costos.

La asignación guarda:
- responsable y propietario del stock;
- región y ciudad de operación;
- punto de venta opcional;
- autorización o no para registrar cobranzas.

Cada venta registra vendedor, propietario del stock, punto, región y ciudad. La operación atómica descuenta del stock central, del stock del representante o del punto de custodia correspondiente.

## 4. Puntos de venta y custodia

- Producto físicamente separado sin cambiar de propietario.
- Transferencia interna hacia el punto.
- Devolución al inventario del propietario.
- Kardex interno de movimientos.
- Saldo por producto y ubicación.
- Solicitudes de reposición del vendedor.

## 5. Mapa territorial

- OpenStreetMap como cartografía principal y CARTO como respaldo.
- El Service Worker no guarda mosaicos cartográficos defectuosos.
- Vista inicial de Bolivia cuando no existen puntos.
- Ubicación actual mediante GPS autorizado.
- Círculo de precisión limitado para no cubrir toda la pantalla.
- Marcación manual tocando el mapa.
- Búsqueda de direcciones en Bolivia.
- Pantalla completa.
- Densidad comercial opcional y desactivada inicialmente.
- Conservación de zoom, posición y capas durante actualizaciones.
- Mensajes claros ante falla de cartografía o conexión.

## 6. Estabilización transversal

- Parches silenciosos por módulo.
- Gestión regional conserva la pantalla y actualiza tarjetas.
- Representantes conservan valores anteriores durante sincronización.
- Distribución mantiene ruta, mapa y desplazamiento.
- Personal mantiene pestaña y contexto.
- Territorio no recrea el mapa por cada evento.
- Stock vinculado se actualiza sin volver a mostrar la carga inicial.

## 7. Seguridad de datos

- Migración idempotente dentro de una transacción.
- Sin DROP TABLE, TRUNCATE ni DELETE histórico.
- Funciones `security definer` con permisos de ejecución limitados.
- RLS para puntos, saldos, movimientos y reposiciones.
- El vendedor solo puede cancelar su propia solicitud pendiente; el propietario controla aprobación y atención.
- Prevención de venta duplicada mediante identificador único.
- Bloqueo de filas durante movimientos y ventas.

## 8. Límites de la validación local

Las auditorías locales comprueban estructura, sintaxis JavaScript, empaquetado, presencia de funciones, controles SQL estáticos y ausencia de SQL dentro del sitio. No sustituyen pruebas autenticadas contra el proyecto real de Supabase, correo, GPS, fotografías y proveedores externos de mapas.

## 9. Archivos de instalación

- `01_V8.0.1_ACCESO_VENDEDORES_MAPA_ESTABLE.sql`
- `02_V8.0.1_VERIFICAR.sql`
- ZIP limpio del sitio web.
