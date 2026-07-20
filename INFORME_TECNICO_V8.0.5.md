# Informe técnico — Natura Vida V8.0.5

## Denominación
**Continuidad de sesión y modo sin conexión seguro**

## Criterio aplicado
Se mantiene la arquitectura online-first y Supabase como fuente oficial. No se reintroduce la antigua cola offline. La versión agrega continuidad operativa pasiva: conserva la interfaz, permite consultar información ya cargada y protege formularios como borradores sujetos a revisión humana.

## Componentes
- `js/v8-offline-continuity.js`: detección de red, avisos, borradores, protección de mutaciones y reconexión.
- `service-worker.js`: caché controlada del app shell y recursos esenciales.
- `css/v8.css`: franja de estado y componentes de revisión.
- `js/settings.js`: centro de continuidad y borradores.

## Seguridad
- No confirma ventas, pagos, ajustes, precios ni eliminaciones sin internet.
- No envía borradores al recuperar conexión.
- No reemplaza registros oficiales por copias locales.
- Las copias locales son temporales y de solo lectura.

## Pruebas
- Sintaxis validada en todos los archivos JavaScript.
- Prueba específica V8.0.5: 12/12 controles.
- Regresión territorial: 9/9 controles.
- Autocompletado de clientes: 4/4 controles.
