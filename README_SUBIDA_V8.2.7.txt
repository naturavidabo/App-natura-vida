NATURA VIDA V8.2.7 — SUBIDA

1. Reemplaza en GitHub el contenido anterior por todos los archivos de este paquete.
2. Espera la publicación de GitHub Pages y confirma que app-version.json indique 8.2.7.
3. Actualiza la PWA o limpia únicamente la caché de la versión anterior.
4. En Supabase > Edge Functions > nv-ai-assistant > Code, reemplaza el código por:
   supabase/functions/nv-ai-assistant/index.ts
   y pulsa Deploy.
5. Si Rendiciones muestra “Configuración pendiente”, ejecuta en SQL Editor:
   supabase/migrations/20260730_v825_seller_settlements.sql
6. No vuelvas a crear la función y no cambies los Secrets de Gemini.

Pruebas mínimas:
- Pedir: “Elabora una venta de tres aceites de 500 ml PET”.
- Aprobar el borrador y comprobar que Ventas abra con 3 unidades y precio real.
- Abrir Rendiciones y verificar el detalle de ventas/cobros del vendedor.
- Confirmar que la cabeza, la insignia IA y el fondo se muevan juntos.
