# NATURA VIDA V6 — Corrección de sincronización entre dispositivos

Esta versión corrige las fallas críticas y altas descritas en el
"Informe técnico de diagnóstico y estado del proyecto Natura Vida"
(25 de junio de 2026), sección II (Problemas pendientes).

## Resumen para alguien no técnico

Había **un bug central** que explica casi todos los síntomas reportados
(inventario que no se replica, ventas que no llegan, mensajería que
funcionaba al principio y luego dejaba de funcionar): cuando un envío a
Supabase fallaba (por ejemplo una venta que ya se había enviado y se
reenviaba), la app **dejaba de enviar todo lo que venía después en la
fila de espera, para siempre**. Bastaba un solo error para trabar
productos, ventas, pedidos y mensajes que se habían generado después de
ese error. Esto coincide exactamente con lo observado: "al principio
sí sincronizaba, después dejó de hacerlo".

Además, el botón **"Actualizar"** del administrador solo *enviaba*
información hacia Supabase, pero nunca *traía* lo que hubiera cambiado
desde otro celular o desde el propio panel de Supabase. Por eso dos
celulares con la misma cuenta de administrador mostraban inventario y
stock distintos: cada uno solo subía su propia versión, ninguno bajaba
la del otro.

## 1. Cola de sincronización ya no se traba (CRÍTICO)

Archivo: `js/supabase-sync.js`, función `flushPendingSyncQueue`.

- Antes: si un elemento de la cola fallaba, se detenía el envío de
  **todos los elementos siguientes**, sin importar si eran productos,
  ventas, pedidos o mensajes distintos.
- Ahora: un elemento con error se reintenta más tarde (hasta 8 veces,
  luego se marca como fallido para no insistir indefinidamente), pero
  ya **no bloquea a los demás**.

## 2. Ventas y pedidos ya no fallan al reintentarse (CRÍTICO)

Archivos: `js/supabase-sync.js`, funciones `insertCloudSale` e
`insertCloudPurchaseOrder`.

- Antes usaban `insert()`. Si la misma venta o pedido se reenviaba
  (algo normal al recuperar conexión), Supabase respondía con un error
  de llave duplicada — y ese error era justamente el que disparaba el
  problema descrito en el punto 1.
- Ahora usan `upsert()`, igual que ya se hacía con productos y
  mensajes: reenviar el mismo registro es seguro y no genera error.

## 2.b Pedidos y mensajes nuevos ya no se pierden si se crean sin conexión (CRÍTICO)

Archivos: `js/orders.js` (`submitOrderRequest`) y `js/inbox.js`
(`saveLocalMessage`).

- Antes, al crear un pedido o un mensaje nuevo, se guardaban con la
  opción `{silent:true}`, que evita que el cambio entre a la cola de
  sincronización. El único intento de subirlo a Supabase era una
  llamada directa, sin reintento. Si el representante estaba sin
  conexión exactamente en ese momento (algo común en campo), ese pedido
  o mensaje quedaba guardado solo en su celular y nunca llegaba al
  administrador, sin ningún aviso de error.
- Ahora ambos se guardan sin `{silent:true}`, así que además del
  intento inmediato quedan en la cola duradera (la misma que se corrigió
  en el punto 1) y se reintentan automáticamente al recuperar conexión.

**Nota técnica para quien siga el código:** no se aplicó este mismo
cambio a `setOrderStatus` (aprobar/rechazar pedido) ni a
`markLocalMessageRead` (marcar mensaje leído), aunque tienen el mismo
patrón. La razón es que esas dos funciones *actualizan* un registro que
ya existe en Supabase, y las columnas `representative_user_id` /
`sender_user_id` son de tipo `uuid` con clave foránea a
`auth.users(id)`. Si se hiciera el mismo cambio ahí, cada actualización
volvería a recalcular ese campo según la sesión de quien aprueba o lee
el mensaje (el administrador), no de quien lo creó originalmente,
sobrescribiendo el dato real. Por eso esas dos siguen usando una
llamada directa y angosta (`updateCloudPurchaseOrderStatus` /
`markCloudMessageRead`) que solo toca el campo de estado — correcta,
pero sin reintento si falla por falta de conexión justo en ese
instante. Es un caso bastante más raro (requiere estar sin internet
justo al aprobar/leer) y se deja documentado para una siguiente fase en
lugar de arriesgar corromper el remitente original.

## 3. Botón "Actualizar" del administrador ahora sí sincroniza en ambos sentidos (CRÍTICO / ALTA)

Archivos: `js/supabase-sync.js` (nueva función `runFullAdminSync`) y
`js/app.js` (botón `qbSync` del panel principal).

- Antes: para el administrador, este botón **solo publicaba** (enviaba
  su catálogo local a Supabase). Nunca recibía cambios hechos desde
  otro dispositivo.
- Ahora, al presionar "Actualizar" siendo administrador, la app:
  1. Envía lo que esté pendiente en la cola (ventas, pedidos, mensajes).
  2. Trae del servidor los productos más nuevos (de otro celular o de
     Supabase directamente).
  3. Publica hacia el servidor los productos locales nuevos.

Para representantes, el botón "Recibir novedades" ahora también envía
primero sus pendientes (ventas, pedidos) antes de traer el catálogo
actualizado, en vez de solo traer cambios.

## 4. Diagnóstico documentado de "Usuarios Online" (pendiente de decisión)

No se modificó código en este punto; se deja documentado porque
requiere una decisión de negocio, no solo una corrección de bug:

La app mantiene **dos listas de usuarios separadas que nunca se
combinan**:

- `js/db.js` → tabla local `users` (IndexedDB): cada celular tiene su
  propia lista, nunca se sube a Supabase. Por eso cada dispositivo
  muestra una cantidad distinta de "usuarios locales".
- `js/supabase-sync.js` → tabla `profiles` en Supabase, ligada a
  `auth.users` (autenticación real de Supabase): solo se llena si se
  crean usuarios directamente en Supabase, porque `profiles.id` exige
  una cuenta real de Supabase Auth (no se puede insertar un perfil sin
  una cuenta de autenticación verdadera detrás).

Esto también es la causa de fondo del punto 9 del informe ("convivencia
de dos sistemas de autenticación"): el inicio de sesión local
(usuario/contraseña en IndexedDB) tiene prioridad y nunca pasa por
Supabase Auth, así que ese usuario nunca llega a `profiles`.

**Unificarlo de verdad requiere crear cuentas reales de Supabase Auth**
cuando un representante activa su celular (usando `supabase.auth.signUp`
con un correo sintético, ya que Supabase Auth exige un correo). Es un
cambio de alcance mayor — afecta cómo inician sesión todos los usuarios
y depende de cómo esté configurada la confirmación de correo en tu
proyecto de Supabase — por eso se deja como siguiente fase, a
confirmar contigo antes de tocar el login.

## 5. Nota sobre RLS en `products` (ya resuelto según el informe, sin cambios de código)

El informe indica que ya se corrigió manualmente en Supabase (cambiando
`status` del administrador a `active`). Solo para que quede registrado:
los archivos `SUPABASE_MIGRACION_V5_1_ESTABLE.sql` y
`SUPABASE_SCHEMA.sql` de este proyecto **desactivan RLS** en `products`,
`profiles`, `sales`, etc. La función `is_admin()` que mencionó el error
403 no existe en ningún script de este proyecto — fue creada
manualmente en algún momento directamente en Supabase y no quedó
registrada en ningún archivo `.sql` del repositorio. Si vuelve a
aparecer un error 403 de "row-level security policy", lo más rápido es
volver a ejecutar `SUPABASE_MIGRACION_V5_1_ESTABLE.sql`.

## Qué NO se tocó en esta versión

- El inventario propio de cada representante (`stock` local, distinto
  del `adminStock` del servidor) sigue siendo intencionalmente local a
  cada dispositivo, tal como se diseñó en V5.0 ("inventario propio del
  representante, nunca se pisa con el servidor"). Si lo que se probó
  en el informe fue la **misma cuenta de representante en dos celulares
  distintos** (no la cuenta de administrador), ese stock divergente es
  esperado con el diseño actual, no un bug de sincronización. Si
  quieres que el stock de cada representante también viaje a la nube
  (para que el mismo representante vea el mismo stock en dos celulares
  suyos), es una funcionalidad nueva — no una corrección — y se puede
  construir en una siguiente fase con una tabla nueva en Supabase.
