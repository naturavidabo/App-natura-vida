# Natura Vida V8.0.0 XD

## Núcleo Modular, Roles y Gestión Territorial

**Fecha de preparación:** 17 de julio de 2026  
**Base requerida:** Natura Vida V7.7.1 instalada y operativa  
**Despliegue:** PWA en GitHub Pages + Supabase

## 1. Objetivo

La V8.0.0 inicia el núcleo modular definido en el Documento Maestro de Arquitectura. No reemplaza ventas, inventario, producción, rutas, cuentas por cobrar ni personal; organiza esas funciones alrededor de una identidad permanente, un rol comercial, una región, un responsable y un alcance territorial.

## 2. Rol recomendado para el hermano del administrador

El rol operativo actual es **Representante regional avanzado**. Puede:

- vender de forma unitaria y mayorista;
- usar catálogo, clientes, cotizaciones y cobranzas;
- comprar al stock central;
- manejar su stock propio;
- organizar personas ya vinculadas a su equipo;
- asignar funciones comerciales básicas a su equipo;
- utilizar rutas y gestión territorial;
- consultar la actividad de las personas bajo su responsabilidad.

Su cuenta, clientes, ventas, stock, cobranzas, rutas y actividad permanecen intactos cuando cambie de función. En una etapa posterior podrá promoverse a Administrador regional distribuidor sin crear otra cuenta.

## 3. Roles y estructura funcional

Se incorpora **Más → Personal y funciones → Roles y estructura funcional**.

El Administrador central puede definir:

- función o rol;
- región o zona;
- responsable directo;
- proveedor habitual;
- observación de alcance.

Cada ficha muestra una explicación breve del rol, herramientas disponibles y capacidades principales. El Representante regional avanzado puede organizar únicamente a las personas que el Administrador central ya haya vinculado a su equipo.

### Roles disponibles para asignación en esta fase

- Administrador central.
- Administrador regional.
- Representante regional avanzado.
- Representante comercial.
- Vendedor de campo.
- Repartidor.
- Personal de apoyo.

Los roles especializados de Producción, Inventario y Finanzas quedan definidos en el catálogo de arquitectura, pero todavía no pueden asignarse como acceso operativo. Esto evita entregar menús que aún no tengan todas sus políticas RLS y transacciones completadas.

## 4. Abastecimiento y pedidos

Cada pedido guarda:

- solicitante;
- región;
- responsable regional;
- proveedor asignado;
- productos y total.

En V8.0.0, el abastecimiento oficial continúa en el **stock central**. La relación regional queda registrada para atribuir equipo, actividad y territorio, pero no se activa todavía una transferencia de stock entre representantes. Esta restricción es deliberada para no generar diferencias de inventario ni pagos regionales incompletos.

El catálogo de compra identifica claramente al proveedor y el historial muestra “Compra a…” con el proveedor registrado.

## 5. Gestión territorial

Se incorpora una categoría propia **Territorio**, separada de Personal y Operaciones.

Incluye:

- registro de prospectos;
- captura de ubicación GPS;
- estados comerciales del prospecto;
- potencial bajo, medio o alto;
- registro de visitas;
- resultado y próxima acción;
- conversión de prospecto a cliente;
- mapa de prospectos, clientes y visitas;
- filtros por persona y estado;
- actividad territorial cronológica;
- representación inicial de densidad territorial.

Cada representante o vendedor construye su mapa con el trabajo diario. El administrador y los responsables regionales pueden visualizar la actividad autorizada de su equipo.

## 6. Actualización silenciosa

Territorio utiliza actualización Realtime agrupada. Los eventos consecutivos se procesan en una sola actualización y se reemplaza únicamente el contenido afectado, conservando pantalla, mapa y contexto. Se mantiene el criterio de la V7.7.1: no volver a mostrar “Cargando” durante una sincronización cuando ya existen datos visibles.

## 7. Centro de Gestión V8

La pantalla Más queda organizada en:

- Comercial.
- Operaciones.
- Territorio.
- Personal y funciones.
- Finanzas.
- Administración.

El Catálogo permanece como herramienta comercial visible. Roles y estructura se ubica dentro de Personal y funciones, mientras Configuración conserva solamente ajustes administrativos.

## 8. Interfaz

La V8 mantiene la cabecera insignia y la línea visual verde bosque, esmeralda y lima. Territorio, roles y áreas modulares incorporan degradados suaves, formas orgánicas, tarjetas de profundidad moderada y adaptación a celular.

## 9. Supabase

El SQL principal incorpora:

- tabla `business_roles`;
- columnas funcionales en `profiles`;
- RPC de asignación segura de función;
- proveedor y región en pedidos;
- tablas `territory_prospects`, `territory_visits` y `territory_events`;
- RLS por identidad, equipo y administración central;
- Realtime territorial;
- auditoría contextual mediante eventos territoriales.

La migración es idempotente y no contiene `DROP TABLE`, `TRUNCATE` ni eliminación de ventas, clientes, stock o historial.

## 10. Instalación

1. Ejecutar `01_V8.0.0_NUCLEO_MODULAR_ROLES_TERRITORIO.sql`.
2. Ejecutar `02_V8.0.0_VERIFICAR.sql`.
3. Confirmar que los controles indiquen `OK`.
4. Extraer el ZIP del sitio.
5. Subir su contenido a la raíz del repositorio.
6. Esperar GitHub Actions en verde.
7. Forzar la actualización desde la aplicación.
8. Ingresar como Administrador central y asignar al hermano el rol **Representante regional avanzado**.

## 11. Pruebas funcionales posteriores al despliegue

- Inicio de sesión del Administrador central.
- Asignación de rol, región y responsable.
- Inicio de sesión del Representante regional avanzado.
- Venta unitaria y mayorista.
- Pedido al stock central.
- Registro de prospecto con GPS.
- Registro de visita.
- Conversión de prospecto a cliente.
- Visualización del mapa propio y del equipo.
- Confirmación de que ninguna sincronización borre o haga parpadear toda la pantalla.
