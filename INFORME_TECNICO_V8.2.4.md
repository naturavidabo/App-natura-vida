# Natura Vida V8.2.4 — Informe técnico

## Objetivo
Corregir el error 500 del motor IA externo, impedir que la auditoría secundaria bloquee una respuesta válida de Gemini y eliminar el aviso falso de cambios sin guardar al salir del Asistente IA.

## Diagnóstico confirmado
La Edge Function alcanzaba el motor externo y procesaba la respuesta, pero fallaba al registrar la auditoría con la expresión `client.rpc(...).catch(...)`. El constructor de consulta devuelto por Supabase no expone ese método `.catch`, por lo que se generaba `client.rpc(...).catch is not a function` y la función devolvía 500.

## Correcciones
- Auditoría de IA ejecutada con `await` dentro de `try/catch`.
- Un fallo de auditoría ahora produce una advertencia `NV_AI_AUDIT_WARNING`, pero no invalida la respuesta de Gemini.
- Se conserva el diagnóstico HTTP real del motor externo.
- El campo de consulta del asistente queda fuera del estado transaccional `V7_FORM_DIRTY`.
- Ya no aparece el aviso “Hay cambios sin guardar…” al salir del chat por escribir una consulta.
- El texto aún no enviado se conserva como borrador local propio del asistente.
- Se mantienen conversación organizada, deduplicación, historial y respaldo local.

## Seguridad
- La clave Gemini continúa únicamente en Supabase Secrets.
- El acceso externo continúa restringido al administrador central.
- Ninguna acción comercial se ejecuta sin confirmación.
- La cola offline automática continúa deshabilitada.

## Archivos
El repositorio contiene 97 archivos, por debajo del límite solicitado de 100.

## Despliegue necesario
1. Subir el contenido completo de V8.2.4 a GitHub Pages.
2. En Supabase, actualizar la función existente `nv-ai-assistant` con `supabase/functions/nv-ai-assistant/index.ts`.
3. Desplegar una nueva versión de la misma función.
4. No volver a crear secretos ni ejecutar nuevamente la migración SQL si ya están instalados.
5. Actualizar la PWA y confirmar V8.2.4.
6. Probar una consulta y verificar `200 POST` en Invocations.
