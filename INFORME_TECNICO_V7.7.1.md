# Natura Vida V7.7.1

## Estabilización e integración operativa

**Fecha:** 16 de julio de 2026  
**Base:** Natura Vida V7.7.0  
**Destino:** PWA en GitHub Pages + Supabase

## 1. Objetivo

La V7.7.1 integra ventas y pedidos con la planificación de entregas, estabiliza las pantallas que reciben eventos Realtime y mejora la identidad visual permanente de la aplicación. También completa la diferenciación entre personal con acceso, personal gestionado sin cuenta y mano de obra ocasional.

## 2. Identidad visual y cabecera permanente

La cabecera superior fue rediseñada como una insignia visual de Natura Vida:

- degradado de verde bosque a verde natural y verde lima;
- logotipo destacado con halo, relieve y detalle orgánico;
- eslogan completo: **“Te cuida por dentro y por fuera”**;
- estado de conexión y fecha integrados;
- botón de bandeja/mensajes conservado;
- fotografía, nombre y función de la persona conectada;
- adaptación compacta para teléfonos pequeños.

Cada usuario puede subir o retirar su propia fotografía desde Perfil. La imagen se guarda en el bucket `profile-assets` y su URL queda vinculada a `profiles.avatar_url`. Las fotografías también se muestran en tarjetas de representantes, gestión regional y personal cuando existe una cuenta vinculada.

## 3. Integración de ventas, pedidos y rutas

Se incorpora la tabla `delivery_requests` como bandeja intermedia de entregas pendientes.

### Venta con entrega

Al confirmar una venta puede activarse **Requiere entrega** y registrar fecha, prioridad, dirección y observaciones. La venta se guarda primero; después se crea una solicitud vinculada por `source_type='sale'` y `source_id`.

### Pedido de representante

Cuando un pedido completa la confirmación de pago y stock, se crea una solicitud vinculada por `source_type='order'`. La restricción única impide duplicar la misma entrega.

### Planificación

En Distribución aparece **Entregas pendientes**. El usuario selecciona una o varias solicitudes y crea una ruta. La función RPC `nv771_plan_delivery_requests` genera:

- ruta;
- secuencia de paradas;
- cliente/destino;
- dirección y GPS disponible;
- productos;
- monto pendiente;
- referencia de venta o pedido.

La solicitud cambia de pendiente a planificada y, al confirmar la entrega, a entregada.

## 4. Realtime estable

La actualización aplica cargas silenciosas en los módulos donde se detectó parpadeo:

- Gestión regional conserva la pantalla y actualiza métricas, tarjetas y solicitudes;
- Representantes conserva stock, ventas y actividad anteriores hasta recibir el nuevo valor;
- Distribución agrupa eventos consecutivos, conserva la ruta abierta y no recrea el mapa si los puntos no cambiaron;
- Personal actualiza el contenido de la pestaña activa y mantiene el desplazamiento.

El mensaje “Cargando…” se reserva para la primera apertura sin datos previos. No se utiliza como estado intermedio durante una sincronización normal.

## 5. Personal y mano de obra

### Personal con acceso

La ficha se marca como `access_mode='app'`, se asigna un `operational_role` y se vincula a una cuenta activa mediante `linked_user_id`. La persona debe crear primero su cuenta y ser aprobada; posteriormente el administrador realiza la vinculación.

### Personal sin acceso

La ficha se marca como `access_mode='managed'`. El responsable registra tareas, asistencia, costos y pagos sin que esa persona ingrese a la aplicación.

### Ayudante ocasional

La mano de obra puede registrarse sin crear ficha permanente ni usuario. Se guarda:

- nombre o referencia;
- fecha;
- lote/trabajo;
- horas o unidades;
- tarifa y costo total;
- estado y forma de pago;
- observaciones.

## 6. Seguridad y datos

- Función administrativa exclusiva `nv771_is_admin_current_user()` para evitar ambigüedades con versiones antiguas.
- Bucket de fotografías con carpeta propia por usuario.
- RLS en `delivery_requests` por administrador, propietario y responsable.
- Planificación mediante función `security definer` con validación del usuario.
- Una cuenta solo puede vincularse a una ficha activa de personal.
- La migración usa `BEGIN/COMMIT` y no borra historial operativo.

## 7. Archivos principales modificados

- `index.html`
- `css/v7.css`
- `js/v7-integration-v771.js`
- `js/v7-regional.js`
- `js/v7-distribution.js`
- `js/v7-workforce.js`
- `js/v7-profile-users.js`
- `js/v7-management-center.js`
- `js/v7-shell.js`
- `js/sales.js`
- `js/v7-orders.js`
- `js/supabase-sync.js`
- `js/v7-supabase.js`
- `js/auth.js`
- `app-version.json`
- `manifest.json`
- `service-worker.js`

## 8. Validaciones locales

- sintaxis de todos los archivos JavaScript mediante `node --check`;
- consistencia de versión en HTML, manifest, service worker y actualizador;
- presencia de cabecera, fotografía, integración de entregas y actualización silenciosa;
- auditoría estática del sitio;
- auditoría del flujo de GitHub Pages;
- comprobación de que el ZIP web no contenga SQL;
- prueba de integridad del archivo ZIP.

Estas validaciones no sustituyen una prueba autenticada contra el proyecto Supabase real. RLS, Storage, Realtime, GPS, fotografías y creación de rutas deben comprobarse después de ejecutar el SQL y publicar el sitio.

## 9. Orden de instalación

1. Ejecutar `01_V7.7.1_ESTABILIZACION_INTEGRACION_OPERATIVA.sql`.
2. Ejecutar `02_V7.7.1_VERIFICAR.sql`.
3. Publicar el contenido del ZIP web en GitHub.
4. Esperar GitHub Actions en verde.
5. Probar con cuentas de administrador y representante.
