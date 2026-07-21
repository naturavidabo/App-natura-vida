# Natura Vida V8.2.1 — Informe técnico

## Objetivo
Incorporar un motor generativo real sin exponer claves, sin enviar la base completa y sin volver dependiente a la aplicación de un proveedor externo.

## Arquitectura
`PWA Natura Vida → Supabase Edge Function nv-ai-assistant → Gemini API`

El navegador calcula métricas y construye un resumen limitado. La Edge Function valida la sesión y el rol `central_admin`, aplica el límite diario, llama a Gemini y exige una respuesta JSON estructurada. Cuando falla la red, la función o el proveedor, el asistente usa automáticamente el análisis local.

## Privacidad y seguridad
- No se incluyen teléfonos, direcciones, correos ni imágenes de comprobantes.
- La clave `GEMINI_API_KEY` vive en Supabase Secrets.
- No se guarda la conversación en el proveedor mediante estado de interacción.
- La auditoría remota registra motor, estado, latencia y hash de consulta, no el texto.
- La IA no puede escribir ventas, stock, precios, pagos ni promociones.

## Archivos nuevos
1. `supabase/functions/nv-ai-assistant/index.ts`
2. `supabase/migrations/20260721_v821_ai_engine.sql`
3. `tests/test_ai_engine_v821.py`

El resto se implementó modificando archivos existentes para mantener el repositorio por debajo de 100 archivos.
