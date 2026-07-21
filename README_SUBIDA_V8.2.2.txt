NATURA VIDA V8.2.2 — INSTALACIÓN

1. Suba el contenido completo del ZIP al repositorio de GitHub Pages.
2. No mezcle archivos de versiones anteriores.
3. Verifique que app-version.json indique 8.2.2.
4. Espere la publicación y use la opción de actualización segura de la aplicación.
5. Cierre y vuelva a abrir la PWA si todavía aparece la versión anterior.

MOTOR GEMINI
- Se reutiliza la migración: supabase/migrations/20260721_v821_ai_engine.sql
- Despliegue nuevamente la función: supabase/functions/nv-ai-assistant/index.ts
- Mantenga GEMINI_API_KEY en Supabase Secrets.
- Opcionales: GEMINI_MODEL=gemini-2.5-flash-lite y AI_DAILY_LIMIT=30.

PRUEBA RÁPIDA
1. Abra el Asistente IA y compruebe que ninguna tarjeta quede cortada.
2. Abra Cuentas por cobrar → Estado de cuenta.
3. Verifique que botones y métricas entren en dos columnas.
4. Pulse “Analizar con IA”.
5. Revise una propuesta y confirme únicamente cuando corresponda.

El repositorio contiene 97 archivos y no supera el límite de 100.
