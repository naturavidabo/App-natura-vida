# Respaldo y migración segura — V8.2.0

## Respaldo obligatorio

Antes de aplicar SQL o publicar la versión, cree un respaldo de la base productiva:

- Supabase Dashboard → Database → Backups, cuando el plan lo permita; o
- `pg_dump` con credenciales seguras; o
- exportaciones CSV de `clients`, `sales`, `app_records` y tablas de inventario.

Guarde el respaldo fuera de GitHub y no publique secretos.

## Preflight

Ejecute:

- `supabase/preflight/00_preflight_readonly.sql`

Revise conteos, duplicados de Gabriela y estructuras existentes.

## Migración

Ejecute:

- `supabase/migrations/20260721_v820_financial_accounts.sql`

Esta migración crea la secuencia documental y funciones auxiliares; no modifica ventas ni stock.

## Verificación

Ejecute:

- `supabase/preflight/01_verify_after_migration.sql`

Después publique la app y haga las pruebas funcionales.

## Restauración

No restaure sobre producción sin probar primero en un proyecto de ensayo. La aplicación valida y exporta información, pero no ejecuta una restauración completa desde el navegador.
