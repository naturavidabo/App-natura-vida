# Natura Vida V7.7.0

## Personal, mano de obra, Centro de Gestión y Realtime estable

**Base:** Natura Vida V7.6.0  
**Fecha de construcción:** 16 de julio de 2026  
**Canal:** estable para validación en Supabase y GitHub Pages

## 1. Alcance consolidado

La V7.7.0 incorpora todos los acuerdos definidos para esta actualización:

- Gestión de personal central y regional.
- Tareas, asistencia, mano de obra y pagos.
- Centro de Gestión organizado por áreas.
- Buscador de funciones, favoritos y accesos recientes.
- Separación entre Configuración y las herramientas operativas.
- Catálogo visible dentro del flujo de Ventas.
- Menú adaptado según rol.
- Grupos propios del representante separados de la condición central de compra.
- Estabilización de Distribución y rutas frente a eventos Realtime consecutivos.
- Renovación visual con verdes vivos, degradados suaves y formas orgánicas.

## 2. Personal y mano de obra

Nuevo módulo `Personal y mano de obra`, disponible desde el área Personal del
Centro de Gestión. Incluye:

- Ficha de personal con área, región, estado, modalidad y tarifa de pago.
- Asociación del personal a un administrador o representante responsable.
- Registro y finalización de tareas.
- Control de asistencia, atraso, ausencia, permiso y baja médica.
- Entrada y salida con ubicación opcional.
- Registro de horas, unidades, tarifa y costo de mano de obra.
- Pagos, anticipos, comisiones y pagos de producción.
- Vista diferenciada por administrador y representante.

## 3. Centro de Gestión

La antigua lista extensa de Más se reemplaza por un centro organizado:

- Comercial.
- Operaciones.
- Personal.
- Finanzas.
- Administración o Configuración.

El centro permite buscar una función por nombre, marcar favoritos y recuperar
las funciones utilizadas recientemente. Las áreas y botones se filtran según
los permisos del usuario.

## 4. Catálogo como herramienta comercial

El Catálogo se mantiene a mano dentro de Ventas, junto con Clientes,
Cotizaciones y Cobranzas. No se oculta dentro de Configuración ni se trata como
una función administrativa.

## 5. Grupos de precio del representante

- Los grupos centrales representan las condiciones definidas por Natura Vida.
- Cada representante carga únicamente sus grupos locales en `Mis grupos de precio`.
- Los grupos locales se aplican a sus clientes, ventas y cotizaciones.
- En la administración, la asignación central se identifica como
  `Condición central de compra`.

## 6. Realtime y reducción del parpadeo

Distribución y rutas deja de ejecutar una recarga global por cada evento de
Supabase. La V7.7.0:

- Agrupa eventos consecutivos con espera breve.
- Actualiza el módulo afectado sin reconstruir toda la aplicación.
- Mantiene la ruta abierta y la posición de desplazamiento.
- Conserva la instancia del mapa Leaflet mientras los puntos no cambien.
- Actualiza tarjetas, métricas y estados de forma silenciosa.
- Evita mostrar nuevamente `Cargando` durante sincronizaciones de fondo.
- Controla que exista un solo canal principal de Realtime.

## 7. Renovación visual

- Barra inferior con degradado verde natural.
- Estados activos más visibles.
- Tarjetas con sombras suaves, iluminaciones circulares y mayor contraste.
- Encabezados orgánicos en Distribución, Centro de Gestión y Personal.
- Paleta verde bosque, esmeralda, hoja y fondos cálidos.

## 8. Base de datos V7.7.0

El SQL principal crea:

- `staff_members`
- `staff_tasks`
- `staff_attendance`
- `labor_costs`
- `staff_payments`
- `workforce_audit_log`

También incorpora índices, restricciones, auditoría, RLS por responsable y
publicación Realtime. La función administrativa usa un nombre exclusivo:
`public.nv770_is_admin_current_user()` para evitar conflictos con funciones de
versiones anteriores.

## 9. Validaciones locales

- Auditoría estática del sitio.
- Auditoría de despliegue.
- Revisión de sintaxis de todos los archivos JavaScript mediante `node --check`.
- Verificación de versiones y referencias de recursos.
- Comprobación de que `index.html` comienza con `<!DOCTYPE html>`.
- Comprobación de que el ZIP web no contiene SQL.
- Prueba de integridad del ZIP.

No fue posible realizar una prueba de navegador completa en el entorno local
por una restricción administrativa que bloquea la apertura de URL locales. La
validación final de Supabase, GPS, Storage, RLS y cuentas reales debe realizarse
en el despliegue del usuario.

## 10. Archivos de instalación

Los SQL se entregan por separado del sitio:

1. `01_V7.7.0_PERSONAL_CENTRO_GESTION.sql`
2. `02_V7.7.0_VERIFICAR.sql`

El ZIP destinado a GitHub no contiene archivos `.sql`.
