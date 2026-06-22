# NATURA VIDA V4.6 — Acceso simple y activación inicial

## Objetivo
Simplificar el ingreso para administrador y vendedores, evitando pantallas confusas y manteniendo una llave de activación.

## Acceso inicial local

### Administrador
- Usuario inicial: `admin`
- Contraseña inicial: `12345678`

### Vendedores / representantes
- Usuarios iniciales disponibles: `vendedor1` hasta `vendedor20`
- Contraseña inicial: `23456`

## Llave de activación
Durante el primer ingreso, la app pide un código de activación:

- Código: `2721971`

Este código no se muestra en pantalla dentro de la app. Debe entregarlo el administrador cuando corresponda.

## Flujo simplificado
1. La persona ingresa con usuario inicial asignado.
2. Ingresa la contraseña inicial.
3. La app pide datos básicos:
   - nombre completo,
   - celular / WhatsApp,
   - ciudad,
   - documento opcional,
   - código de activación,
   - nueva contraseña personal.
4. Desde ese momento, el usuario deja de usar `vendedor1`, `vendedor2`, etc.
5. Su nuevo usuario personal será su número de celular.

## Ejemplo
Primer ingreso:
- usuario: `vendedor3`
- contraseña: `23456`

Luego configura:
- celular: `70700000`
- nueva contraseña: la que el vendedor decida

Siguientes ingresos:
- usuario: `70700000`
- contraseña: su nueva contraseña

## Archivos modificados
- `js/db.js`
- `js/auth.js`
- `js/app.js`
- `css/app.css`
- `service-worker.js`
