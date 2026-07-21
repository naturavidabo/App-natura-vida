NATURA VIDA V8.2.0
ESTADOS DE CUENTA, DEUDAS ACTIVAS Y DOCUMENTOS DE COBRO
========================================================

BASE UTILIZADA
- Natura Vida V8.1.2 — Asistente Comercial Analítico.
- La V8.2.0 es acumulativa: conserva las funciones anteriores y añade el sistema financiero por cliente.

ORDEN SEGURO DE INSTALACIÓN
1. NO reemplace todavía la versión pública.
2. Cree un respaldo real del proyecto Supabase desde Dashboard / Database / Backups, o mediante pg_dump si dispone de acceso.
3. Descargue además una exportación de las tablas clients, sales, app_records y, si existen, inventario y perfiles.
4. Ejecute primero los scripts de supabase/preflight en modo de solo lectura.
5. Ejecute supabase/migrations/20260721_v820_financial_accounts.sql.
6. Publique el contenido de esta carpeta en GitHub Pages.
7. Inicie sesión como administrador central y confirme que la aplicación muestre V8.2.0.
8. En Finanzas / Cuentas por cobrar, use “Importar deudas históricas”.
9. Revise el caso de Gabriela con la vista previa antes de confirmar.
10. Compruebe que no se creó ningún movimiento de inventario.

IMPORTACIÓN DE GABRIELA
Opción recomendada dentro de la aplicación:
- Finanzas → Cuentas por cobrar → Importar deudas históricas.
- Pulsar “Cargar caso confirmado: Gabriela Espinoza”.
- Revisar 7 operaciones, Bs 2.095,00 pagados y Bs 5.426,20 pendientes.
- Confirmar la importación.

Opción administrativa SQL:
- Aplicar únicamente desde Supabase SQL Editor con privilegios administrativos.
- Revisar supabase/imports/20260721_gabriela_espinoza_confirmada.sql.
- La función incluida no está habilitada para usuarios comunes.

IMPORTANTE
- Las deudas históricas se guardan separadas de las ventas actuales.
- inventoryImpact=false y stockAlreadyDelivered=true impiden un nuevo descuento lógico de inventario.
- No se incorpora una cola offline automática.
- Los pagos se registran con asignaciones por operación y pueden anularse con motivo, restaurando el saldo.
- La restauración de una base de datos no se ejecuta desde el navegador.

ARCHIVOS PRINCIPALES NUEVOS
- js/v8-financial-core.js
- js/v8-financial-accounts.js
- data/imports/gabriela-espinoza-mi-negocio.json
- supabase/migrations/20260721_v820_financial_accounts.sql
- supabase/imports/20260721_gabriela_espinoza_confirmada.sql
- supabase/preflight/*.sql

PRUEBA POSTERIOR A LA PUBLICACIÓN
- Buscar Gabriela Espinoza.
- Abrir Estado de cuenta.
- Verificar 7 operaciones.
- Total comprado: Bs 7.521,20.
- Total pagado: Bs 2.095,00.
- Saldo: Bs 5.426,20.
- Generar Estado de cuenta y Recibo consolidado.
- Leer el QR desde otro teléfono si existe un QR configurado en el perfil comercial.
- Registrar un pago parcial de prueba y después anularlo.
- Confirmar que el saldo vuelva al valor anterior.

No se puede confirmar el contenido real de la base productiva desde este paquete. La migración y las pruebas de conexión deben completarse en el proyecto Supabase real antes de declarar el despliegue definitivo.
