# Natura Vida V8.1.0 — Asistente IA Beta

## Alcance implementado
- Botón flotante exclusivo para administrador central.
- Panel inferior rápido y pantalla completa integrada a Natura Vida.
- Contexto según pantalla actual.
- Análisis local verificable de ventas, utilidad estimada, margen, stock crítico y clientes inactivos.
- Simulación orientativa de descuentos mediante acceso a reglas comerciales.
- Ninguna acción se ejecuta sin confirmación.
- Sin cola offline automática.

## Motor
Esta Beta funciona con cálculos locales sobre AppState. No envía datos a terceros.
La conexión con Gemini/OpenAI debe realizarse después mediante una Supabase Edge Function y secretos del servidor; nunca con una clave expuesta en GitHub Pages.
