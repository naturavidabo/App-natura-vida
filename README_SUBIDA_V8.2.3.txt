NATURA VIDA V8.2.3 — SUBIDA SEGURA

1. Antes de reemplazar la versión, descargar una copia del repositorio actual.
2. Subir el contenido del ZIP a la raíz del repositorio, reemplazando archivos existentes.
3. Confirmar que el repositorio contiene 97 archivos y no supera 100.
4. Esperar la ejecución de GitHub Actions y verificar que todas las pruebas estén aprobadas.
5. En Supabase abrir Edge Functions > nv-ai-assistant > Code.
6. Reemplazar el código por:
   supabase/functions/nv-ai-assistant/index.ts
7. Desplegar una nueva versión de la misma función. No crear otra función.
8. No modificar GEMINI_API_KEY, GEMINI_MODEL ni AI_DAILY_LIMIT si ya existen.
9. Actualizar la PWA y confirmar que indica V8.2.3.

PRUEBA RÁPIDA
- Escribir una sola inicial: no debe abrirse una lista grande.
- Escribir un nombre: debe aparecer una cápsula compacta si hay coincidencias.
- Escribir nombre y apellido: deben aparecer como máximo dos coincidencias.
- Para seleccionar, tocar Usar.
- En el asistente, crear una consulta, pulsar Nueva y comprobar que la anterior aparece en Historial.
- Consultar Gemini y verificar Invocations: la petición POST debe responder 200 o mostrar un diagnóstico específico.
