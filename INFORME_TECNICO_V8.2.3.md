# Natura Vida V8.2.3 — Informe técnico

## Objetivo
Afinar la captura de clientes y organizar el Asistente IA sin sacrificar estabilidad ni superar los 100 archivos del repositorio.

## Correcciones de alta de clientes
- El autocompletado ya no abre una tarjeta grande con una sola inicial.
- Con un solo nombre suficiente se muestra únicamente una cápsula compacta de coincidencias posibles.
- La lista detallada se despliega automáticamente después de dos palabras o de una coincidencia exacta; también puede abrirse manualmente.
- Se muestran inicialmente como máximo dos clientes.
- La selección requiere tocar el botón explícito **Usar**; tocar la tarjeta no cambia el cliente.
- En móvil la lista se integra dentro del formulario y desplaza los campos, sin cubrir nombre, teléfono ni botón de confirmación.
- Si el texto deja de coincidir, la lista desaparece.
- Existe la acción **No es ninguno · seguir escribiendo**.

## Afinación del Asistente IA
- Conversación actual deduplicada para eliminar repeticiones consecutivas y respuestas duplicadas del mismo request.
- Botón **Nueva**: archiva la conversación actual antes de comenzar otra.
- Botón **Historial**: permite abrir o borrar hasta 12 conversaciones anteriores.
- Opción para limpiar solo el chat actual.
- Panel gerencial plegable para reducir desplazamiento vertical.
- Botón flotante para ir al mensaje más reciente.
- Diagnóstico visible cuando falla el motor externo, sin ocultar el cálculo local.
- Se mantiene la confirmación humana para cualquier acción sensible.

## Motor externo
La Edge Function incluida fue corregida para:
- retirar parámetros incompatibles de la petición;
- usar salida estructurada JSON;
- registrar errores reales con `console.error`;
- conservar códigos HTTP útiles;
- diferenciar error de Gemini, respuesta vacía y respuesta no JSON.

No se añadió una migración SQL nueva. Se reutiliza `20260721_v821_ai_engine.sql`.

## Compatibilidad y protección
- No se reactivó la cola offline automática.
- No se modifican ventas, inventario, pagos, precios o clientes mediante IA sin confirmación.
- Se conservan estados de cuenta, deudas históricas, auditoría, reglas comerciales y continuidad segura.
- Repositorio final: **97 archivos**.
