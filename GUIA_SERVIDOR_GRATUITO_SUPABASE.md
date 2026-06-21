# NATURA VIDA BOLIVIA — Servidor gratuito online

## Arquitectura recomendada

- **GitHub Pages**: aloja la PWA estática.
- **Supabase Free**: aloja usuarios, roles, productos, precios y ventas.
- **IndexedDB**: mantiene funcionamiento offline en cada celular.

## Paso 1 — Crear proyecto Supabase

1. Entra a Supabase.
2. Crea un proyecto nuevo.
3. Guarda la contraseña de base de datos.
4. En Project Settings > API copia:
   - Project URL
   - anon/public key

## Paso 2 — Crear tablas y permisos

1. En Supabase abre SQL Editor.
2. Copia todo el archivo `SUPABASE_SCHEMA.sql`.
3. Ejecuta Run.

## Paso 3 — Crear usuarios

1. Ve a Authentication > Users.
2. Crea un usuario para el administrador, por ejemplo:
   - `admin@naturavida.bo`
3. Crea usuarios para revendedores, por ejemplo:
   - `revendedor1@naturavida.bo`
4. Copia el UUID de cada usuario.
5. En SQL Editor ejecuta los insert de `profiles`, reemplazando los UUID.

Ejemplo:

```sql
insert into public.profiles (id, username, full_name, role, role_id, status)
values ('UUID_DEL_ADMIN', 'admin', 'Administrador Natura Vida', 'Administrador', 'role_admin', 'active');

insert into public.profiles (id, username, full_name, role, role_id, status)
values ('UUID_DEL_REVENDEDOR', 'revendedor1', 'Revendedor Demo', 'Revendedor', 'role_reseller', 'active');
```

## Paso 4 — Activar la app online

Abre `js/supabase-config.js` y cambia:

```js
window.NATURA_ONLINE_CONFIG = {
  enabled: true,
  supabaseUrl: 'TU_PROJECT_URL',
  supabaseAnonKey: 'TU_ANON_KEY'
};
```

## Paso 5 — Subir a GitHub Pages

1. Sube todos los archivos de esta carpeta al repositorio.
2. Espera el deploy de GitHub Pages.
3. Limpia caché de la PWA si ves versión vieja:
   - F12
   - Application
   - Service Workers
   - Unregister
   - Clear storage
   - Ctrl + F5

## Funcionamiento del negocio

### Administrador
- Crea productos.
- Actualiza costo, precio revendedor y precio público.
- Publica productos al servidor.
- Puede ver inventario completo y reportes.

### Revendedor
- Entra con su cuenta.
- Actualiza catálogo/precios desde el servidor.
- Ve precio base revendedor.
- Ve precio público sugerido.
- Coloca su propio precio de venta.
- La app calcula su margen automáticamente.

Ejemplo:

- Precio revendedor/base: Bs 100
- Precio público sugerido: Bs 150
- Si vende a Bs 150, margen: Bs 50
- Si vende a Bs 140, margen: Bs 40
- Si vende a Bs 160, margen: Bs 60

## Nota de seguridad

La clave `anon/public` de Supabase puede ir en el frontend. La seguridad real está en las políticas RLS del archivo SQL. No subas claves secretas de servicio al repositorio.
