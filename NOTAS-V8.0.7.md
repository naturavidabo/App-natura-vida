# Natura Vida V8.0.7

## Reglas comerciales, márgenes y descuentos

Esta versión incorpora una política comercial central antes de habilitar el futuro asistente de inteligencia artificial.

### Funciones nuevas

- Configuración del margen mínimo general.
- Cálculo del precio mínimo desde el costo real.
- Precio mínimo específico y opcional por producto.
- Descuento máximo global.
- Descuento máximo autorizado por rol.
- Motivo obligatorio desde el porcentaje configurado.
- Excepción documentada exclusiva del administrador central.
- Promociones por todos los productos, categoría o producto específico.
- Fechas de inicio y finalización para promociones.
- Simulador de precio, margen y utilidad total.
- Validación en ventas centrales, de representantes y vendedores vinculados.
- Registro de cumplimiento de reglas dentro de la venta.

### Corrección de interfaz

El aviso grande de conexión fue retirado. El estado se muestra en una cápsula pequeña en la parte superior derecha con un punto y uno de estos textos:

- En línea
- Sin internet
- Reconectando
- Conectando

La cápsula no desplaza el contenido. Al tocarla se abre el detalle de continuidad y borradores.

### Activación segura

Las reglas se instalan desactivadas para no bloquear precios existentes sin revisión. El administrador central debe comprobar costos, márgenes y límites y activarlas manualmente. Las promociones solo aparecen en ventas cuando la política está activa.

### Protección

- La IA todavía no modifica precios ni crea promociones.
- Una venta fuera de regla se bloquea, salvo excepción autorizada y motivada del administrador central.
- La cola offline automática continúa deshabilitada.
- Los formularios sin conexión continúan como borradores sujetos a revisión humana.
