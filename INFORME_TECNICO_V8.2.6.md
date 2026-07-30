# Natura Vida V8.2.6 — Informe técnico

## Alcance

Esta versión consolida la selección de forma de pago, retira el QR de los documentos, depura la edición manual de precios y amplía el Asistente IA como secretario comercial supervisado.

## Implementaciones

- Ventana compacta para seleccionar **Efectivo**, **QR / transferencia** o **A crédito** antes de confirmar una venta.
- El efectivo queda identificado para rendición de caja; los pagos digitales se registran por separado.
- El pago QR puede recibir confirmación en tiempo real mediante `NVBankPaymentAdapterV826` o el evento `nv:payment-confirmed` cuando exista una API bancaria oficial. Sin API, exige confirmación manual del ingreso.
- Los recibos y documentos financieros ya no incorporan la imagen QR. Muestran forma, estado y referencia de pago.
- En edición de precio, solo **Precio final manual** usa naranja. Los demás controles vuelven a verde/neutro.
- Campos dinámicos según precio final, rebaja en bolivianos, rebaja porcentual, recargo en bolivianos o recargo porcentual.
- El asistente permite **Rechazar, Editar o Aprobar** borradores de pagos, recibos y planes de pago antes de abrir el formulario definitivo.
- Cada respuesta dispone de **Escuchar / Detener**, usando la voz local del navegador mediante SpeechSynthesis. No se usa micrófono, Gemini Live ni audio continuo.
- Se conservan conversaciones, acciones confirmadas, cálculo local y motor externo Gemini.

## Seguridad

- Ninguna operación se ejecuta sin confirmación humana.
- La lectura en voz alta ocurre en el dispositivo y no consume una nueva consulta de IA.
- No se simula una API bancaria. La integración automática queda condicionada a credenciales y webhook oficiales del proveedor.
- No se recupera la cola offline automática.

## Base de datos

No requiere una migración nueva. Conserva la migración V8.2.5 para rendiciones de caja y las migraciones anteriores de IA y finanzas.

## Límite del repositorio

El paquete mantiene 99 archivos y no supera el máximo solicitado de 100.
