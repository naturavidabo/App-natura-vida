# NATURA VIDA V7.2.0 — Auditoría de estabilización

**Fecha:** 9 de julio de 2026  
**Base revisada:** ZIP extraído del último repositorio de GitHub entregado por el propietario.  
**Despliegue objetivo:** GitHub Pages + Supabase.  
**Modo operativo:** en línea; no se habilitó una cola de ventas offline.

## 1. Resultado general

Se revisaron los flujos críticos de venta, inventario, imágenes, QR, formularios móviles, PWA, actualización y buzón. La versión corregida mantiene Supabase como única fuente persistente y evita volver a una arquitectura local/offline que pueda producir duplicidades o diferencias de stock.

La falla que bloqueaba la venta no estaba en la interfaz: el procedimiento `register_sale_atomic` intentaba escribir `user_id` en `public.audit_log`, pero esa columna no existía en la base de datos. Por ese motivo la corrección requiere **dos partes inseparables**:

1. Publicar el código V7.2.0.
2. Ejecutar la migración SQL incluida en Supabase.

Sin el segundo paso, la venta puede continuar fallando aunque se publique el nuevo frontend.

## 2. Hallazgos críticos y correcciones

### A. Venta bloqueada por `audit_log.user_id`

**Hallazgo:** desalineación entre el código/RPC de Supabase y la estructura real de `audit_log`.

**Corrección:** se creó una migración idempotente que:

- agrega `audit_log.user_id` si falta;
- conserva registros históricos;
- asegura índices y valores predeterminados;
- reconstruye `log_audit_event` con `auth.uid()`;
- no elimina ventas, inventario, productos ni clientes.

**Archivo:** `sql/2026-07-09_v7_2_0_stabilization.sql`.

### B. Reintentos de venta y riesgo de duplicidad

**Hallazgo:** cuando una conexión se corta después de que PostgreSQL confirma una operación, el navegador puede recibir un error aunque la venta ya exista. Un reintento mal diseñado puede duplicar la venta o descontar stock dos veces.

**Corrección:**

- cada intento conserva un único ID de operación;
- el mismo ID se reutiliza en el botón **Reintentar la misma operación**;
- antes de asumir que falló, se consulta la venta por ese ID;
- se vuelve a leer el stock online antes de confirmar;
- se bloquea el doble toque mientras la operación está en curso;
- el recibo solo se abre después de confirmar la venta.

Se aplicó tanto al flujo del administrador como al del representante.

### C. Mensajes técnicos expuestos al usuario

**Hallazgo:** la aplicación mostraba directamente errores internos de PostgreSQL.

**Corrección:** se agregaron mensajes comprensibles para errores de migración, red, permisos RLS y duplicidad. El detalle técnico ya no debe aparecer como mensaje principal al vendedor.

### D. Imágenes lentas y fotografías demasiado pequeñas

**Hallazgos:**

- una regla CSS obligaba `object-fit: contain`, haciendo que el producto se viera pequeño;
- las fotografías se descargaban repetidamente;
- no existía un encuadre previo uniforme;
- el PDF también mostraba la imagen completa con demasiado espacio libre.

**Correcciones:**

- fotografías comerciales con `object-fit: cover` y recorte moderado;
- el QR mantiene `contain` para no cortar el código;
- editor de encuadre con arrastre, zoom, centrado y vista previa;
- compresión previa a JPG cuadrado antes de subir;
- ruta fija por producto y `upsert`, evitando archivos huérfanos;
- carga diferida y decodificación asíncrona;
- caché específica de imágenes en el service worker, sin cachear el código de la app;
- catálogo PDF con fotografías cuadradas que llenan el marco.

Las imágenes existentes muy pesadas no se transforman mágicamente en el servidor. Cuando una fotografía antigua se vuelva a editar y guardar, quedará optimizada con el nuevo flujo.

### E. QR que indicaba “guardado” y luego desaparecía

**Hallazgo:** cuando Storage fallaba, el código intentaba guardar el `data:image/...` completo dentro del perfil y mostraba un éxito aparente. Además, no se verificaba el valor después de guardar.

**Corrección:**

- se eliminó ese falso respaldo interno;
- si Storage falla, no se guarda el perfil ni se muestra éxito;
- el QR se sube a `payment-assets/<usuario>/qr-current.jpg`;
- después del guardado se vuelve a consultar Supabase y se compara la URL;
- se añadió eliminación de QR;
- se añadieron bucket y políticas RLS en la migración;
- el QR propio aparece en recibos y, opcionalmente, en el catálogo PDF.

### F. Teclado ocultando Guardar o Confirmar

**Hallazgo:** las hojas modales utilizaban la altura física de la ventana y no la altura visible cuando Android abre el teclado.

**Corrección:**

- uso de `window.visualViewport`;
- altura dinámica de la hoja;
- desplazamiento automático al campo activo;
- espacio inferior para el teclado;
- acciones principales pegadas al borde inferior visible;
- confirmación antes de abandonar formularios con cambios sin guardar.

### G. Actualizaciones difíciles en GitHub Pages

**Hallazgo:** no había un centro visible de versión ni una activación controlada del service worker.

**Corrección:**

- sección **Más → Actualizaciones**;
- versión instalada y versión publicada;
- botones **Buscar actualización**, **Actualizar ahora** y **Recargar archivos**;
- archivo `app-version.json` sin caché;
- service worker con `SKIP_WAITING` y recarga tras cambio de controlador;
- JavaScript, CSS y HTML siempre se consultan en red;
- las fotos sí se almacenan en caché para acelerar su visualización;
- la actualización no borra inventario, ventas ni perfiles de Supabase.

### H. Buzón sin comunicación directa

**Hallazgo:** el buzón mostraba mensajes, pero no ofrecía un flujo práctico para escribir o responder.

**Corrección:**

- el representante puede usar **Escribir al administrador**;
- el administrador puede responder al remitente desde la tarjeta del mensaje;
- tipos: consulta, pedido/producto, soporte y pago/comprobante;
- envío directo a Supabase, sin cola offline;
- políticas RLS incluidas para remitente, destinatario y administrador.

## 3. Alcance de la migración SQL

La migración incluida actúa sobre:

- `public.audit_log`;
- función `public.log_audit_event`;
- función auxiliar `public.nv72_is_admin_20260709`;
- `public.commercial_profiles`;
- función `public.update_my_commercial_profile_v7`;
- bucket `payment-assets` y políticas de Storage;
- `public.messages` y políticas RLS.

No modifica ni borra:

- productos;
- stock del administrador;
- stock de representantes;
- ventas existentes;
- clientes;
- pedidos;
- precios oficiales.

## 4. Verificaciones ejecutadas

### Comprobaciones automáticas realizadas

- **25 comprobaciones de sintaxis JavaScript:** 24 módulos y el service worker, todas aprobadas con `node --check`.
- **130 verificaciones estáticas:** recursos, versiones, rutas, venta atómica, ID de reintento, validación de stock, QR, buzón, CSS móvil, actualización y contenido de migración.
- **Prueba HTTP local:** `index.html`, `app-version.json`, service worker, JavaScript, CSS y SQL respondieron con HTTP 200.
- Revisión de que todos los recursos locales citados por `index.html` existen.
- Revisión de que no quedan referencias de publicación `?v=7.1.x` en el HTML.

### Limitación de esta auditoría

No se ejecutó una venta autenticada contra el proyecto real de Supabase desde este entorno, porque no existe una sesión de usuario del propietario ni acceso administrativo al SQL Editor. Tampoco se alteró la base de datos remota. Por lo tanto, la prueba final en dispositivo debe realizarse después de ejecutar la migración y publicar el código.

No es responsable afirmar que una aplicación conectada a una base remota está “100 % verificada” sin esa prueba de integración. El código y la migración quedaron preparados para realizarla de forma controlada.

## 5. Matriz de prueba obligatoria después del despliegue

Marcar cada caso como aprobado antes de habilitar representantes:

| N.º | Prueba | Resultado esperado |
|---:|---|---|
| 1 | Iniciar sesión como administrador | Carga productos, inventario, ventas y perfil sin error |
| 2 | Venta de un producto con stock | Registra una sola venta, descuenta una sola vez y abre recibo |
| 3 | Doble toque en Confirmar | Solo una operación; botón permanece bloqueado |
| 4 | Cortar internet durante la confirmación | Muestra error controlado; al reintentar usa el mismo ID |
| 5 | Reintentar después de respuesta incierta | Si la venta ya existía, la recupera sin duplicarla |
| 6 | Producto sin stock suficiente | Bloquea la venta antes de registrar |
| 7 | Subir foto grande | Abre editor, encuadra, guarda y carga con rapidez razonable |
| 8 | Cerrar y abrir app | La foto continúa visible y aprovecha caché |
| 9 | Subir QR propio | Guarda, vuelve a consultar y muestra el QR actual |
| 10 | Cerrar sesión y volver a entrar | El QR continúa visible |
| 11 | Generar recibo | Muestra el QR del vendedor correspondiente |
| 12 | Generar catálogo con QR | Incluye el QR solo cuando la opción está marcada |
| 13 | Formulario con teclado abierto | Guardar/Confirmar permanece accesible |
| 14 | Representante escribe al administrador | Mensaje aparece en el buzón del administrador |
| 15 | Administrador responde | Mensaje aparece en el buzón del representante correcto |
| 16 | Publicar una versión posterior | Más → Actualizaciones detecta y aplica la nueva versión |

## 6. GitHub Pages o Vercel

Para esta versión no es necesario migrar a Vercel. GitHub Pages puede servir correctamente esta PWA porque el backend real es Supabase. Cambiar el hosting no corregiría `audit_log`, RLS, Storage ni la lógica de venta. La prioridad es publicar de forma consistente, ejecutar la migración y aprobar la matriz de pruebas.

Una futura migración de hosting solo debería considerarse por necesidades adicionales de despliegue o administración, no como solución a los errores actuales.

## 7. Conclusión

La V7.2.0 corrige la causa identificada de la venta bloqueada, fortalece el reintento para evitar duplicidades, estabiliza QR e imágenes, adapta los formularios al teclado, añade actualización visible e incorpora comunicación directa representante–administrador.

La versión no debe declararse lista para producción hasta completar estos dos pasos:

1. Ejecutar el SQL de estabilización en el proyecto correcto de Supabase.
2. Aprobar en celular las 16 pruebas de integración anteriores.
