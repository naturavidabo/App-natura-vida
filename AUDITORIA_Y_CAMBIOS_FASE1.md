# NATURA VIDA BOLIVIA PWA — Auditoría técnica y cambios Fase 1

## Estado original detectado

La aplicación original ya tenía una base útil: PWA estática, service worker, funcionamiento offline mediante IndexedDB, inventario, clientes, ventas, cotizaciones, recibos, respaldo JSON y ajustes. La estructura era simple y fácil de ejecutar.

La principal limitación era que el modelo de datos todavía era de una app personal de inventario/ventas, no de una plataforma comercial con administrador, revendedores, clientes finales, roles, comisiones, reportes y sincronización futura.

## Qué estaba bien

- PWA funcional con manifest y service worker.
- IndexedDB ya usado correctamente como base offline.
- Módulos separados por archivo: db, state, products, sales, clients, quotes, settings.
- Carrito de venta multiproducto.
- Cotizaciones, clientes, recibos y respaldo local.
- Fotos en productos mediante base64/dataURL.

## Qué estaba mal o incompleto

- `db.js` tenía versión 1 y pocos stores: no existían usuarios, roles, permisos, comisiones, movimientos de inventario, auditoría ni cola de sincronización.
- El inventario no tenía modelo comercial completo con costo, precio revendedor y precio público como campos principales.
- La utilidad histórica se calculaba usando el costo actual del producto, por lo que si se editaba el costo después de vender, el reporte podía cambiar.
- El dashboard inicial era básico y no mostraba indicadores comerciales reales.
- El service worker seguía en cache v1; al reemplazar archivos podía conservar versiones anteriores.
- Seguridad: no existía login real ni control de permisos. En una PWA estática no puede existir seguridad fuerte sin backend; sí se puede preparar login local, pero la seguridad profesional debe completarse con servidor/API.

## Cambios reales realizados

### db.js

- DB_VERSION subido a 2.
- Se mantiene IndexedDB offline.
- Se agregaron stores profesionales:
  - users
  - roles
  - permissions
  - inventoryMovements
  - commissionRules
  - commissions
  - reportsCache
  - syncQueue
  - auditLog
- Se agregaron índices para productos, ventas, clientes, cotizaciones, usuarios, movimientos, comisiones y sincronización.
- Se agregó migración de productos legacy al nuevo modelo:
  - category
  - sku
  - cost
  - resellerPrice
  - publicPrice
  - status
  - syncStatus
  - createdAt
  - updatedAt
- Se agregó cola de sincronización futura (`syncQueue`).
- Se agregó auditoría local (`auditLog`).
- Se agregó bootstrap inicial de roles:
  - Administrador
  - Revendedor
  - Supervisor
- Se agregó regla base de comisión futura para revendedor.

### products.js

- Inventario convertido a modelo comercial avanzado.
- Cada producto ahora maneja:
  - Nombre
  - Categoría
  - SKU opcional
  - Costo
  - Precio Revendedor
  - Precio Público
  - Stock
  - Descripción
  - Fotografía
  - Estado
  - Trazabilidad local
- Se mantiene compatibilidad con los campos anteriores:
  - unitPriceFixed → publicPrice
  - wholesalePriceFixed → resellerPrice
  - insumos → costeo opcional
- Nuevo formulario profesional de producto.
- Nuevo cálculo de utilidad revendedor y utilidad público.
- Nuevo registro de movimientos de inventario cuando se crea o edita stock.
- Nueva visualización de cards con categoría, SKU, costo, precios, margen y stock.

### app.js

- Inicio convertido en dashboard comercial moderno.
- Se agregaron KPIs:
  - Ventas de hoy
  - Ventas del mes
  - Utilidad estimada del mes
  - Stock bajo
  - SKU activos
  - Costo del stock
  - Valor público del inventario
- Se agregaron accesos a:
  - Venta
  - Inventario
  - Cotizaciones
  - Clientes
  - Usuarios/Roles
  - Comisiones
- Se agregaron pantallas base para próximas fases:
  - Usuarios, roles y permisos
  - Comisiones automáticas
  - Reportes profesionales
- El resumen ahora calcula utilidad con costo histórico cuando la venta lo tiene.

### app.css

- Se agregaron estilos profesionales para:
  - Dashboard comercial
  - KPI cards
  - Paneles modernos
  - Inventario V2
  - Cards de producto avanzadas
  - Badges de categoría y SKU
  - Formulario de producto avanzado
  - Vista de utilidad y margen
  - Alertas de stock bajo

### state.js

- Se actualizó `grossCost()` para priorizar el campo `cost` del nuevo modelo.
- Se agregaron flags de preparación:
  - setupRequired
  - cloudSyncPrepared
  - apkPrepared
  - businessModel

### sales.js

- Se adaptó la venta a modelo público/revendedor.
- Cada ítem vendido guarda ahora:
  - unitCost
  - unitPrice
  - subtotal
  - profit
  - category
- Se registra movimiento de inventario por venta.
- Se registra auditoría local por venta.

### service-worker.js

- Cache actualizado a `natura-vida-v2-fase1` para forzar actualización PWA.

## Limitaciones honestas

Esta entrega implementa Fase 1 real y deja la base técnica para Fases 2–5. No activa todavía login seguro completo porque, para hacerlo profesionalmente, se debe definir si será:

1. Login local offline con PIN/contraseña cifrada en navegador, útil para control básico del dispositivo.
2. Login real con backend/API, tokens, sesiones y reglas de permisos, necesario para seguridad comercial real y sincronización multiusuario.

Una PWA 100% estática no puede proteger datos comercialmente contra un usuario técnico con acceso al navegador. Para producción multiusuario con revendedores, la Fase 2 debe incorporar backend o al menos una arquitectura híbrida offline-first con sincronización autenticada.

## Próxima fase recomendada

FASE 2 debe crear:

- Pantalla de primer administrador.
- Login local inicial.
- Tabla users activa.
- Hash de contraseña/PIN con Web Crypto.
- Sesión local con vencimiento.
- Guardas por rol en `canAccessTab()`.
- Separación de ventas por revendedor.
- Preparación para backend futuro.
