NATURA VIDA V8.2.1 — INSTALACIÓN DEL MOTOR IA HÍBRIDO

1. Esta versión conserva todas las funciones de V8.2.0.
2. Suba el contenido del ZIP a GitHub Pages como en versiones anteriores.
3. En Supabase SQL Editor ejecute: supabase/migrations/20260721_v821_ai_engine.sql
4. En Supabase → Edge Functions cree o despliegue la función nv-ai-assistant usando supabase/functions/nv-ai-assistant/index.ts.
5. En Supabase → Edge Functions → Secrets configure GEMINI_API_KEY.
6. Opcional: GEMINI_MODEL=gemini-2.5-flash-lite y AI_DAILY_LIMIT=30.
7. No coloque la clave de Gemini en index.html, archivos JavaScript ni GitHub.
8. Abra Más → Administración → Asistente IA y pulse Comprobar.
9. Si la función o la clave faltan, la app continúa con análisis local sin bloquearse.

El repositorio contiene menos de 100 archivos para facilitar la carga.
