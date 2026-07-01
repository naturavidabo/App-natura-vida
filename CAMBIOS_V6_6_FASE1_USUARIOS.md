# NATURA VIDA V6.6 — Orden de Refactorización V6, FASE 1: Modelo único de usuario

Implementa las secciones 4, 5, 6 y 7 de la "Orden de Refactorización –
Natura Vida PWA V6". Es la base de la que dependen el resto de las
secciones (botón único de sincronización, SyncManager, etc.), por eso se
hizo primero.

## Qué se hizo

### SQL — `SUPABASE_MIGRACION_V6_6_USUARIOS.sql` (ejecutar primero)

- Agrega `email` y `last_login_at` a `profiles`.
- Normaliza `role` a exactamente dos valores: `administrador` /
  `representante` (antes podía ser "Administrador", "Revendedor",
  "Supervisor").
- Normaliza `status` a exactamente tres valores: `pendiente` / `activo` /
  `bloqueado` (antes era `active`/`inactive`).
- Si no existe ningún administrador activo tras la migración, promueve
  automáticamente a la cuenta más antigua — para no quedar sin nadie que
  pueda aprobar al resto.
- Completa el `email` de cuentas viejas a partir de `auth.users`, para
  que el campo nunca quede vacío.

**No borra ninguna cuenta.** Las cuentas que ya tenías (admin, y
representantes ya activados con el correo sintético `...@natura-vida-app.local`)
siguen funcionando exactamente igual que antes, ahora con los nuevos
valores normalizados.

### Código — nuevas funciones (`js/auth.js`, `js/supabase-sync.js`)

- `registerNewAccount(nombre, correo, contraseña)` — "Crear cuenta".
  El primer usuario que se registre en todo el proyecto se activa
  automáticamente como administrador; todos los siguientes quedan como
  representante y **pendiente** de aprobación.
- `loginWithEmail(correo, contraseña)` — "Ya tengo cuenta". Un usuario
  bloqueado no puede entrar; uno pendiente sí puede entrar (para ver su
  estado) pero queda marcado para que no opere.
- `requestPasswordRecovery(correo)` — "Recuperar acceso", usa el
  mecanismo de Supabase.
- `adminApproveUser(id)` / `adminBlockUser(id)` / `adminUnblockUser(id)`
  — solo un administrador puede usarlas.
- `fetchAllProfilesForAdmin()` — lista completa para el panel de
  usuarios.
- `canOperate()` — true/false según si la sesión actual puede vender o
  sincronizar (false mientras esté "pendiente" o "bloqueado").

Se corrigieron además dos funciones que todavía comparaban contra el
valor viejo `'active'` (`onlineSignIn`, `getOnlineSessionProfile`) — si
no se corregían, **la migración SQL por sí sola habría roto el login de
todo el mundo**, porque después de normalizar ya no existiría ningún
perfil con `status='active'` literal.

## Qué falta de esta fase (todavía no se tocó)

- **Las pantallas nuevas** ("Crear cuenta" / "Ya tengo cuenta" /
  "Recuperar acceso", panel de usuarios con 🟢🟡🔴) — las funciones de
  arriba ya están listas, pero el HTML/JS de las pantallas en `app.js`
  todavía no se conectó a ellas. Es el siguiente paso de esta misma fase.
- **Eliminar el flujo viejo** (usuario/teléfono + código de activación)
  — se dejó funcionando en paralelo a propósito, para no romper nada
  mientras las pantallas nuevas no existan todavía. Se retira cuando las
  pantallas nuevas reemplacen a las viejas.
- **Bloquear ventas/sincronización real cuando `canOperate()` es
  falso** — la función ya existe y ya se probó, pero todavía no está
  "enchufada" en sales.js ni en los botones de sincronización.

## Qué NO se tocó todavía de la orden completa

- Sección 1 (botón único "Sincronizar") y sección 8 (SyncManager único).
- Sección 2 (respaldo único) y sección 3 (Intercambio Inteligente
  simplificado).
- Tabla `clients` en Supabase (necesaria para que el botón único pueda
  "subir clientes pendientes").

## Pruebas reales ejecutadas

`auditoria-pruebas-2026-06-27/test8-user-model.js` — 21/21 verificaciones
reales pasaron: primer usuario administrador automático, segundo usuario
pendiente, bloqueo de operaciones mientras está pendiente, aprobación,
bloqueo/desbloqueo, rechazo de login a usuarios bloqueados, recuperación
de contraseña, listado de usuarios, validaciones de correo/contraseña.

Se volvió a correr **toda** la suite de pruebas anterior (login,
productos, cola offline, stock atómico, no-colgado) para confirmar que
nada de lo ya estabilizado se rompió con estos cambios — las 6 suites
pasan completas.
