# Good King V0.8.0

Versión consolidada del sistema local-first para ventas, caja, clientes, productos, recetas, inventario, mercado, compras, gastos, reportes y acceso remoto mediante Supabase.

## Actualización directa

La V0.8.0 puede publicarse directamente sobre la versión que estaba en GitHub sin publicar previamente la V0.7.0. Conserva la base local `goodKingDB` y migra IndexedDB directamente de V5 a V7. Agrega, sin borrar almacenes anteriores, las áreas locales de recetas, lista de mercado y gastos, junto con sus índices de mantenimiento.

Antes de reemplazar los archivos:

1. Descarga un respaldo desde Good King.
2. Sube todos los archivos de este paquete a la raíz del repositorio.
3. No borres los datos del sitio ni desinstales la PWA antes de actualizar.
4. Ejecuta `supabase/06_good_king_v080_migration.sql` en Supabase.
5. Abre Good King, presiona **Actualizar** o usa **Más → Configuración → Buscar actualización**.

## Funciones consolidadas

- Venta en efectivo y QR con numeración diaria.
- Consumo automático de inventario según recetas configuradas.
- Reversión del inventario al anular una venta.
- Compras que actualizan stock, costo promedio y caja cuando corresponda, con comparación frente al precio anterior.
- Historial de movimientos de inventario para compras, ventas, reversiones, ajustes y mermas.
- Gastos ocasionales y recurrentes, con impacto correcto en caja y rentabilidad.
- Reportes diarios y mensuales, impresión y exportación CSV.
- Usuarios y roles consultables desde Supabase.
- IndexedDB, respaldos, auditoría, diagnóstico, PWA y cola offline.
- Sincronización autenticada con Supabase para el núcleo operativo.

## Archivos principales

- `index.html`: interfaz y formularios.
- `app.js`: núcleo local, caja, ventas, Auth y sincronización base.
- `v06.js`: productos, fotografías, inventario y compras.
- `v07.js`: recetas, costos y lista de mercado.
- `v08.js`: gastos, reportes, usuarios, consumo por ventas y saneamiento de caja/sync.
- `supabase/06_good_king_v080_migration.sql`: migración remota obligatoria.
- `TEST_REPORT.md`: verificación técnica de la entrega.

## Seguridad

La aplicación usa únicamente una clave pública publishable/anon. Nunca debe publicarse `service_role`, una secret key ni la contraseña de PostgreSQL.
