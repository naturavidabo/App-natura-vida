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

## 0. [CRÍTICO — encontrado tras pruebas reales] El punto de corte de descarga usaba el reloj del celular, no el del servidor

Archivo: `js/supabase-sync.js`, función `syncCloudProductsToLocal`.

Síntoma exacto reportado: la escritura a Supabase funciona (POST devuelve
201, el contador de `products` sube, el registro aparece con ID nuevo),
pero otro dispositivo con la misma cuenta **nunca** descarga ese producto,
sin importar cuántas veces se presione "Actualizar".

Causa: para no descargar el catálogo completo cada vez, la app guarda un
"punto de corte" (`products_last_sync`) y la próxima vez solo pide al
servidor productos con `updated_at` posterior a ese punto. El bug era que
ese punto de corte se guardaba como `new Date().toISOString()` — **la
hora del reloj del celular que sincroniza**, no la fecha real que vino del
servidor. Si el reloj de ese celular está apenas un poco adelantado
(frecuente en Android, sobre todo Redmi/Poco sin hora automática exacta),
el punto de corte queda por delante de cualquier producto futuro, y desde
ese momento la descarga incremental deja de traer novedades **para
siempre**, sin ningún error visible.

Corrección:
- El punto de corte ahora se calcula a partir del `updated_at` más reciente
  que efectivamente vino en la respuesta del servidor (dato confiable,
  generado por Supabase), nunca con el reloj del dispositivo.
- El botón **"Actualizar"** (administrador) y **"Recibir novedades"**
  (representante) ahora fuerzan siempre una descarga completa
  (`syncCloudProductsToLocal({ full: true })`) en lugar de la versión
  incremental. Así, presionar el botón manualmente **autocorrige** cualquier
  punto de corte que haya quedado mal en el pasado, sin esperar a que la
  sincronización automática en segundo plano (que sigue usando la versión
  incremental, ya corregida, cada 5 minutos) lo resuelva sola.
- Además se corrigió una inconsistencia en el flujo del representante: la
  vista previa de "Recibir novedades" mostraba el catálogo completo del
  servidor, pero al aplicar el cambio usaba la versión incremental — por lo
  que podía mostrar productos nuevos y luego no descargarlos realmente al
  confirmar. Ahora la vista previa y la aplicación usan la misma descarga
  completa.

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

## 6. [V6.2] Unificación de usuarios y autenticación — Supabase como fuente principal

Esta sección reemplaza lo que antes estaba "documentado pero sin tocar".
Ya se implementó.

### Qué cambia para alguien no técnico

Antes, cuando un representante "activaba su celular" (ponía su número y su
contraseña), esa cuenta quedaba **guardada solo en ese celular**. Si
perdía el teléfono o quería usar otro dispositivo, no había forma de
recuperar su acceso, y el administrador no podía verlo en ningún lado
real (solo en cada celular individualmente).

Ahora, al activar su celular, la persona **también** queda registrada con
una cuenta real en Supabase (correo interno generado a partir de su
número, no necesita un correo real de verdad). Desde ese momento:

- Puede iniciar sesión desde otro celular con el mismo número y contraseña.
- El administrador la ve en el panel "Usuarios" → "Perfiles online
  Supabase", que ahora es la lista real y única de todo el negocio.
- Las cuentas que ya existían antes de esta actualización (admin,
  vendedor1, y cualquier representante que ya se activó en versiones
  anteriores) se vinculan automáticamente **la próxima vez que inicien
  sesión exitosamente**, usando la contraseña que escriban en ese momento.
  No es necesario que nadie vuelva a activarse manualmente.

### Detalle técnico

Archivos: `js/auth.js`, `js/supabase-sync.js`, `js/app.js`.

1. **`authenticateUser` ahora intenta Supabase primero**, no al final. Antes
   intentaba login online solo si no encontraba un usuario local con ese
   nombre, y además llamaba a Supabase pasando el nombre de usuario tal
   cual como si fuera un correo (Supabase nunca acepta eso) — en la
   práctica el login online nunca llegaba a completarse de verdad. Ahora se
   genera un correo interno (`toSyntheticEmail`, ej.: `70700000` →
   `70700000@natura-vida-app.local`) y se intenta primero contra Supabase.
   Si falla por falta de conexión o porque la cuenta todavía no existe en
   la nube, se usa el acceso local como respaldo (offline, o cuentas no
   migradas todavía).

2. **Nueva función `createOrLinkCloudAccount`** (en `supabase-sync.js`):
   crea la cuenta real en Supabase Auth (`signUp`) usando el correo interno
   y la contraseña que la persona eligió, y guarda su perfil en la tabla
   `profiles`. Se usa en dos momentos: al activar el celular
   (`updateLocalPassword`) y, para cuentas más antiguas, automáticamente en
   el primer inicio de sesión exitoso después de esta actualización
   (`migrateLegacyUserToCloud`).

3. **`restoreSession` invierte su prioridad**: antes, al reabrir la app,
   se restauraba primero la sesión local guardada en este celular. Ahora
   se restaura primero la sesión real de Supabase si existe y el perfil
   sigue activo — así, si el administrador bloquea a alguien desde
   Supabase, esa persona no puede seguir entrando con una sesión local
   vieja que ignoraba ese cambio.

4. **Justo después de iniciar sesión, se descarga el catálogo completo
   desde Supabase de inmediato** (`syncAfterLogin`), en vez de esperar el
   temporizador de sincronización en segundo plano. Esto es para que la
   información que ve la persona apenas entra sea siempre la de Supabase,
   no la que haya quedado guardada de una sesión anterior.

5. **Contraseña mínima: de 4 a 6 caracteres**, porque Supabase Auth exige
   6 como mínimo por defecto. Con 4, la cuenta local se creaba pero la
   cuenta en la nube fallaba siempre al intentar vincularla.

### ⚠️ Dos cosas que debes revisar en el panel de Supabase (no es código)

1. **Authentication → Providers → Email → "Confirm email" debe estar
   DESACTIVADO** para este proyecto. Como se usa un correo interno (no
   real), si Supabase exige confirmación por correo, la cuenta se crea
   pero queda "sin confirmar" para siempre — el código detecta este caso
   y avisa con un mensaje, pero no puede resolverlo por sí mismo, es una
   opción que solo se cambia desde el panel de Supabase.
2. Si algún representante personalizó su celular en una versión MUY
   anterior con una contraseña de menos de 6 caracteres, su cuenta local
   sigue funcionando igual que siempre, pero la vinculación automática a
   Supabase fallará (Supabase la rechazará por ser muy corta) hasta que
   esa persona cambie su contraseña por una de 6+ caracteres.

### Qué faltaba para que TODO se guarde y recupere desde Supabase (ya resuelto, ver sección 7 más abajo)

Con la unificación de autenticación, autenticación, productos, ventas,
pedidos y mensajes ya funcionan con Supabase como fuente principal (se
escribe ahí primero, se lee de ahí primero, IndexedDB queda solo como
caché para que la app funcione sin internet). El único punto que faltaba
era el stock propio de cada representante — confirmaste que también debía
viajar a la nube, y quedó implementado en la sección 7.

## 7. [V6.3] Stock propio del representante, ahora sincronizado entre sus celulares

Esto responde a la pregunta que quedó pendiente: el stock de cada
representante sigue siendo SUYO (no se mezcla con el inventario central
del administrador), pero ahora también vive en Supabase, así que si esa
misma persona entra desde otro celular, ve el mismo número.

**Requiere ejecutar un script SQL nuevo** (a diferencia de las
correcciones anteriores, esto sí es una tabla nueva):
`SUPABASE_MIGRACION_V6_3_STOCK_REPRESENTANTE.sql` — créala en Supabase >
SQL Editor > New query > Run. No borra ni toca nada existente.

### Cómo funciona

- Tabla nueva `representative_stock`: una fila por (representante,
  producto), con su cantidad. Ligada al UUID real de su cuenta de
  Supabase (por eso depende de la unificación de autenticación V6.2 —
  un representante todavía no vinculado sigue usando su stock 100% local,
  sin errores, hasta que su cuenta quede vinculada).
- Se envía a la nube en los dos momentos donde el representante cambia su
  propio stock: al ajustar manualmente su inventario ("Guardar mi
  inventario") y al descontarse automáticamente por una venta.
- Al sincronizar (botón "Recibir novedades" o automático), si ya existe
  un valor en la nube para ese representante y ese producto, ese es el
  que se usa — no el que haya quedado guardado en este celular en
  particular.
- Como todo lo demás en V6, el envío es duradero: si no hay conexión
  justo en ese momento, queda en cola y se reintenta solo al recuperar
  internet, sin perder el cambio.

### Qué NO cambia

- El inventario central del administrador (`adminStock` / lo que ve el
  catálogo como "Stock central ref.") sigue siendo una cosa totalmente
  distinta, como hasta ahora.
- Dos representantes distintos NUNCA comparten stock entre sí — cada uno
  sigue viendo y manejando solo el suyo, ahora simplemente disponible en
  todos SUS PROPIOS celulares.

## 8. [V6.4] Stock del representante: ajuste atómico (no más "valor absoluto") + RLS

Esto corrige exactamente los dos puntos que confirmaste como pendientes
tras revisar la V6.3.

### Punto 3 — Conflicto entre dos celulares del mismo representante: RESUELTO

**Antes:** cada celular calculaba su nuevo stock total y lo mandaba como
número absoluto ("mi stock final es X"). Si dos celulares mandaban casi al
mismo tiempo, el que llegaba último pisaba por completo al anterior — se
podía perder el efecto de una venta.

**Ahora:** cada celular manda el AJUSTE, no el resultado final ("aplica
-2" en vez de "déjalo en 13"). Ese ajuste se aplica con una función en
Supabase (`adjust_representative_stock`, ver
`SUPABASE_MIGRACION_V6_4_STOCK_ATOMICO_RLS.sql`) que suma el delta sobre
el valor real más reciente en una sola operación atómica de Postgres. Si
dos celulares mandan -2 y -3 casi al mismo tiempo, el resultado final
refleja las DOS ventas (-5), sin importar el orden de llegada.

Además, cada ajuste lleva un identificador único (`movementId`) generado
una sola vez en el celular y reutilizado en cada reintento. Si la
respuesta de un envío se pierde por un corte de red justo después de que
Supabase ya lo aplicó, el reintento con el mismo identificador **no
vuelve a aplicarlo** — la función primero revisa si ese movimiento
concreto ya quedó registrado en la nueva tabla
`representative_stock_movements` y, si es así, devuelve el resultado que
ya había sin tocar nada de nuevo.

Se actualizaron los dos lugares donde el representante cambia su stock:
- Venta (`sales.js`): ahora manda `-cantidad_vendida` en vez del stock ya
  calculado.
- Ajuste manual de inventario (`products.js`): ahora manda la diferencia
  entre lo que había y lo nuevo, en vez del número final.

### Punto 5 — RLS en `representative_stock`: RESUELTO

Se agregó una política: cada representante solo puede leer y escribir
filas donde `representative_user_id = auth.uid()`. La función de ajuste
atómico sigue funcionando igual (es "security definer" y además ignora
cualquier id que el celular intente mandar — usa siempre `auth.uid()` de
la sesión real, así que no hay forma de ajustar el stock de otra
persona ni mandando un id distinto a propósito).

### Necesitas ejecutar un SQL nuevo

`SUPABASE_MIGRACION_V6_4_STOCK_ATOMICO_RLS.sql` — Supabase > SQL Editor >
New query > Run. Requiere haber ejecutado antes
`SUPABASE_MIGRACION_V6_3_STOCK_REPRESENTANTE.sql` (crea la tabla base). No
borra datos existentes.
