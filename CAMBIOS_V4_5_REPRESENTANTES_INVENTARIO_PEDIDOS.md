# NATURA VIDA — AUDITORÍA TÉCNICA V6.5 DE SINCRONIZACIÓN

Fecha: 27 de junio de 2026

## Cómo se hizo esta auditoría (importante, leer primero)

Para esta auditoría se montó un entorno de pruebas en Node.js que carga
el código JavaScript **real** del proyecto (los mismos archivos `.js`,
sin modificar su lógica) contra una base de datos local simulada y un
backend de Supabase simulado en memoria. Esto permitió **ejecutar** la
lógica real de login, sincronización, cola offline y stock atómico con
varios "dispositivos" virtuales compartiendo el mismo backend — no solo
leer el código y suponer que funciona.

**Límite honesto de este método:** no hay acceso a tu proyecto real de
Supabase (no hay conexión a internet ni tus credenciales disponibles
aquí), así que no se probó contra el Postgres real ni se verificó que
las políticas RLS estén realmente activas en tu base de datos en este
momento. Lo que se probó es: (a) que la lógica JavaScript hace exactamente
lo que se espera dado un backend que se comporta como Postgres/Supabase
debería comportarse, y (b) que el SQL escrito coincide exactamente con lo
que el mock reproduce. Antes de confiar 100%, sigue valiendo la prueba
manual en tu Supabase real con dos celulares, que es insustituible.

Encontré y corregí **3 bugs reales** durante esta auditoría (no existían
antes de hoy en tu lista de problemas conocidos). Se explican en detalle
en la sección "Bugs encontrados y corregidos hoy" más abajo. Esto explica
directamente la sensación de "parece peor que antes" — uno de los tres
(mensajes) era una regresión introducida por mí mismo en una corrección
anterior de esta misma conversación.

---

## 1. Login con Supabase

| Verificación | Resultado | Evidencia |
|---|---|---|
| Todos los usuarios pueden iniciar sesión | ✅ Confirmado | Admin (acceso inicial), representante recién activado, representante "viejo" no vinculado |
| Cada usuario queda vinculado a su `auth.uid()` real | ✅ Confirmado | El `id` guardado en `profiles` es exactamente el mismo UUID que devuelve `auth.signUp`/`signInWithPassword` |
| Segundo dispositivo del mismo usuario entra online (no en modo local) | ✅ Confirmado | Login con el mismo usuario/contraseña desde un "celular" nuevo entra con `online:true` y el mismo `auth.uid()` |
| Cuenta vieja (de antes de V6.2, nunca vinculada) sigue entrando sin romperse | ✅ Confirmado | Entra en modo local la primera vez, se vincula sola en segundo plano, la siguiente vez entra online |
| Contraseña incorrecta se rechaza, incluso en un dispositivo nuevo | ✅ Confirmado | No hay forma de "adivinar" acceso por quedar en modo local |

Prueba ejecutada: `test1-login.js` — 17/17 verificaciones pasaron.

---

## 2. Descarga inicial — qué tabla sincroniza y cuál no (inventario completo)

| Dato local (IndexedDB) | ¿Sincroniza con Supabase? | Detalle |
|---|---|---|
| **products** (productos/catálogo) | ✅ Sí, en ambos sentidos | Tabla `products`. Tu pregunta sobre "categorías": no existe una tabla de categorías separada — la categoría es un campo de texto dentro de cada producto, así que viaja junto con él. |
| **sales** (ventas) | ✅ Sí, hacia arriba (sube a Supabase) | Tabla `sales`. No hay necesidad actual de "descargarlas" de vuelta al mismo dispositivo que las generó. |
| **purchaseOrders** (pedidos) | ✅ Sí, en ambos sentidos | Tabla `purchase_orders`. Sube siempre; **baja solo al abrir/refrescar la pantalla de Pedidos**, no con el botón general "Actualizar" (ver punto 4). |
| **messages** (mensajería) | ✅ Sí, en ambos sentidos (recién corregido hoy, ver bug #1) | Tabla `messages`. Baja solo al abrir/refrescar la bandeja de mensajes. |
| **representative_stock** (stock propio del representante) | ✅ Sí, en ambos sentidos | Vía función RPC atómica, ver punto 6. |
| **profiles / users** (cuentas) | ⚠️ Parcial | Las cuentas SÍ se crean en `profiles` al activarse (V6.2). Pero la lista local "users" de cada celular nunca se sube — son dos listas relacionadas pero técnicamente separadas, ver detalle en el informe anterior. |
| **clients** (clientes) | ❌ No sincroniza | No existe tabla de clientes en Supabase en este proyecto. Queda 100% local a cada dispositivo. No genera error al intentarlo, simplemente no hace nada. |
| **quotes** (cotizaciones) | ❌ No sincroniza | Igual que clientes. |
| **priceGroups, settings, roles, permissions, commissionRules, reportsCache, auditLog, representatives, dispatches, representativeReports, importedPackages, inventoryMovements, commissions** | ❌ No sincronizan | Ninguna de estas tablas locales tiene conexión con Supabase en el código actual. Son datos 100% del dispositivo. |

Prueba ejecutada: `test234-tables.js` — confirma con ejecución real que
productos y pedidos sí llegan y se descargan, y que clientes no llega a
ninguna tabla remota sin generar error.

---

## 3. Sincronización de subida

✅ **Ventas, pedidos y productos nuevos llegan correctamente a Supabase**, confirmado con prueba real.

❌ **Clientes nuevos NO llegan a Supabase** — no porque esté roto, sino
porque no existe esa tabla remota en este proyecto (ver punto 2). Si
necesitas que los clientes también se compartan entre dispositivos del
mismo representante o sean visibles para el administrador, es una
funcionalidad nueva (tabla nueva en Supabase), no una corrección.

**Bug encontrado y corregido hoy:** los mensajes nuevos NO estaban
llegando a Supabase en absoluto desde la versión anterior (V6.2) por un
error real en el código. Ver sección de bugs más abajo.

---

## 4. Sincronización de bajada

✅ **Productos:** confirmado que un producto creado en un celular aparece
en otro al presionar "Actualizar".

✅ **Pedidos:** confirmado que un pedido creado por un representante
aparece para el administrador — **pero solo al abrir o refrescar
específicamente la pantalla de Pedidos**, no con el botón general
"Actualizar" del panel principal. Esto no es un bug — es así desde antes
de esta auditoría — pero quería dejarlo confirmado y documentado porque
puede sentirse como "no sincronizó" si solo se prueba con el botón
general. Si quieres que el botón general también traiga pedidos y
mensajes nuevos, dime y lo agrego (sería una pequeña extensión del botón,
no un cambio de arquitectura).

✅ **Mensajes:** mismo comportamiento que pedidos — bajan al abrir la
bandeja de mensajes, no con el botón general.

---

## 5. Cola offline

| Verificación | Resultado |
|---|---|
| Un mensaje creado sin conexión queda en la cola y no se pierde | ✅ Confirmado |
| Al volver la conexión, se envía solo (sin tener que repetir la acción) | ✅ Confirmado |
| Reintentar el envío de la cola no duplica filas en Supabase | ✅ Confirmado (gracias a `upsert` con `onConflict:'id'` en ventas/pedidos/mensajes/productos) |
| Un elemento que el servidor rechaza de verdad no bloquea a los demás elementos de la cola | ✅ Confirmado |
| Tras varios intentos fallidos seguidos, ese elemento se marca "failed" y deja de reintentarse para siempre (no acumula ruido) | ✅ Confirmado (tope de 8 intentos) |

**Bug encontrado y corregido hoy:** un elemento que el servidor
rechazaba por una razón real (no de red) se marcaba como "enviado
correctamente" sin haberse guardado nunca en Supabase. Ver sección de
bugs.

Prueba ejecutada: `test5-queue.js` — 11/11 verificaciones pasaron.

---

## 6. Stock

| Verificación | Resultado |
|---|---|
| El mismo representante ve su stock actualizado desde un segundo celular | ✅ Confirmado |
| Dos celulares del mismo representante vendiendo "al mismo tiempo" (-7 y -12 en paralelo) — el resultado final refleja AMBAS ventas, no solo la última | ✅ Confirmado: 50-7-12=31 exacto |
| Reintentar el mismo ajuste (mismo `movementId`) no lo aplica dos veces | ✅ Confirmado |
| Un representante no puede leer el stock de otro, incluso consultando la tabla directamente sin el filtro que pone la app | ✅ Confirmado (RLS) |
| Un representante no puede escribir el stock de otro mandando un id distinto al suyo a propósito | ✅ Confirmado (RLS + la función ignora cualquier id que no sea su `auth.uid()` real) |

**Nota de comportamiento (no es un bug, pero hay que saberlo):** el piso
de "nunca menos de 0" se aplica en cada ajuste individual, no solo al
final. Si una venta intenta descontar más de lo que hay disponible en la
nube en ese momento, el remanente negativo se "pierde" silenciosamente
en vez de quedar registrado como sobreventa. Es el comportamiento querido
(el stock nunca debe verse negativo), solo se documenta para que quede
claro y consciente.

Prueba ejecutada: `test6-stock.js` — 8/8 verificaciones pasaron.

---

## 7. Consola — errores, promesas rechazadas

Se encontraron y corrigieron **3 bugs reales**, dos de ellos exactamente
de esta categoría (errores que no se manejaban bien). Detalle completo
abajo. Tras las correcciones, se repitió toda la batería de pruebas con
un detector de "promesas rechazadas sin manejar" activo — **cero
incidentes** en la versión corregida.

---

# BUGS ENCONTRADOS Y CORREGIDOS HOY (V6.5)

## Bug 1 — Los mensajes nuevos no llegaban a Supabase desde V6.2 (regresión)

**Causa real:** `db.js` tiene una lista interna de qué tablas locales
disparan el envío a la nube cuando se guarda un registro nuevo
(`['products', 'sales', 'clients', 'quotes', ...]`). Esa lista **no
incluía `'messages'`**. En la corrección anterior de esta conversación
(V6.2), se cambió `inbox.js` para apoyarse en ese mecanismo automático
en vez de hacer una llamada directa — pero como `'messages'` nunca
estuvo en esa lista, la condición que dispara el envío era siempre
falsa. Resultado: ningún mensaje nuevo llegaba a Supabase, ni de
inmediato ni por la cola, desde que se aplicó esa corrección. Esto es
peor que el comportamiento original (donde sí llegaban, al menos
estando en línea) — es exactamente la "regresión" que sospechabas.

**Corrección:** se agregó `'messages'` a esa lista en `db.js` (en las
funciones `put` y `delete`).

## Bug 2 — Un error real del servidor (no de red) se ocultaba y se marcaba como "enviado"

**Causa real:** las funciones que envían productos, ventas, pedidos y
mensajes a Supabase (`cloudAfterPut`/`cloudAfterDelete`) atrapaban
**cualquier** error y solo lo mostraban con `console.warn`, sin avisarle
a quien las llamaba que algo había fallado. Además, `upsertCloudProduct`
y `deleteCloudProduct` tenían el mismo problema en su propio interior.
Resultado: la cola de sincronización marcaba un elemento como "done"
(enviado con éxito) **incluso cuando el envío real había fallado** —
por ejemplo, ante un error de validación del servidor. El dato quedaba
perdido de Supabase sin ningún reintento ni aviso, y sin que nadie se
enterara.

**Corrección:** esas funciones ahora revisan el resultado real de cada
envío y, si falló, vuelven a lanzar el error para que la cola lo detecte
y lo reintente como corresponde (con el mismo tope de reintentos del
punto 5).

## Bug 3 — El botón de sincronización quedaba colgado para siempre si se usaba sin conexión

**Causa real:** la función que trae el catálogo desde Supabase
(`fetchCloudProductRows`) podía **lanzar una excepción** en vez de
devolver un error normal cuando fallaba la conexión. El botón "Recibir
novedades" / "Actualizar de forma segura" (el que más usan los
representantes) no estaba preparado para eso: quedaba con el texto
"Actualizando…" y deshabilitado **para siempre**, sin ningún mensaje de
error, y dejando una promesa rechazada sin manejar en la consola del
navegador. Esto es muy probable que haya pasado en la práctica — un
representante en la calle sin señal presionando ese botón es justamente
el escenario más común, no uno raro.

**Corrección:** se blindó esa función para que cualquier error de
conexión devuelva siempre un resultado normal (`{ok:false, mensaje}`), y
además se envolvió toda la función de sincronización de catálogo en una
protección adicional, para que ningún error inesperado vuelva a dejar un
botón colgado sin aviso.

---

# Qué NO se tocó (decisiones, no bugs)

- El botón general "Actualizar" del panel principal sigue sin traer
  pedidos/mensajes nuevos (solo productos) — comportamiento confirmado,
  no modificado, a la espera de que confirmes si quieres ampliarlo.
- Clientes y cotizaciones siguen sin sincronizar — no hay tabla remota
  para ellos en este proyecto.
- No se hicieron cambios de arquitectura ni funciones nuevas más allá de
  las correcciones de bugs descritas arriba, según lo pedido.
