NATURA VIDA V8.0.0 XD — NÚCLEO MODULAR, ROLES Y TERRITORIO
============================================================

ORDEN OBLIGATORIO

1) SUPABASE
   Ejecutar:
   01_V8.0.0_NUCLEO_MODULAR_ROLES_TERRITORIO.sql

2) VERIFICACIÓN
   Ejecutar:
   02_V8.0.0_VERIFICAR.sql

   Revisar que los controles indiquen OK.

3) GITHUB
   - Extraer el ZIP del sitio.
   - No subir el ZIP cerrado.
   - Arrastrar todo el contenido extraído a la raíz del repositorio.
   - index.html debe quedar directamente en la raíz.
   - No subir archivos SQL al repositorio.
   - Si el repositorio quedó limpio con V7.7.1, no es obligatorio borrar todo:
     se pueden reemplazar los archivos con los de V8.0.0.

4) PUBLICACIÓN
   - Esperar que GitHub Actions finalice en verde.
   - Abrir la aplicación.
   - Entrar en Más > Administración > Actualizaciones.
   - Pulsar Actualizar ahora.

5) ASIGNACIÓN DEL HERMANO
   - Entrar como Administrador central.
   - Más > Personal y funciones > Roles y estructura funcional.
   - Abrir su cuenta.
   - Función: Representante regional avanzado.
   - Definir región.
   - Responsable: Administrador central o el responsable que corresponda.
   - Proveedor: Administración / stock central.
   - Guardar.

IMPORTANTE

- El cambio de rol conserva la misma cuenta y todo el historial.
- El Representante regional avanzado puede vender, comprar, tener stock,
  gestionar clientes, rutas, territorio y organizar su equipo asignado.
- En V8.0.0 el abastecimiento entre representantes NO está activado.
  Todos los pedidos oficiales continúan en el stock central para proteger
  el inventario y evitar diferencias de pago.
- Producción, Inventario y Finanzas aparecen en la guía de arquitectura,
  pero todavía no se asignan como cuentas operativas independientes.

COMPROBACIONES

- app-version.json: 8.0.0
- index.html empieza con <!DOCTYPE html>
- el ZIP web no contiene SQL
- workflow ejecuta audit_site_v800.py y audit_deployment.py
- todos los JavaScript pasan node --check
