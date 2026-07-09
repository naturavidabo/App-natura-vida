# Informe de corrección — Natura Vida V7.2.0 / GitHub Pages

## Diagnóstico

1. El ZIP recibido no contenía `.github/workflows/`; por tanto, el repositorio dependía del flujo automático `pages-build-deployment` de GitHub Pages.
2. El error **The job was not acquired by Runner of type hosted** sucede antes de que el código o los pasos sean ejecutados. Corresponde a disponibilidad del runner alojado.
3. La advertencia de Node.js 20 provenía de una acción antigua del flujo automático, no del JavaScript de Natura Vida.
4. La aplicación es estática y no necesita compilarse con Node.js. Solo requiere validar y empaquetar sus archivos.
5. La corrección de la venta `audit_log.user_id` está incluida, pero debe ejecutarse en Supabase antes de probar ventas.

## Correcciones preparadas

- Workflow propio `.github/workflows/deploy-pages.yml`.
- Acciones actualizadas: checkout v6, configure-pages v6, upload-pages-artifact v5 y deploy-pages v5.
- Concurrencia `cancel-in-progress: true` para cancelar despliegues anteriores del mismo grupo.
- Ejecución manual mediante `workflow_dispatch`.
- Dos trabajos separados: validación/empaquetado y despliegue.
- Carpeta `_site` limpia: solo publica la aplicación; no publica SQL, pruebas ni informes.
- Auditoría automática de 138 comprobaciones estáticas.
- Auditoría adicional del workflow con 16 comprobaciones.
- YAML validado.
- Prueba HTTP local de recursos críticos con respuesta 200.
- SQL de verificación posterior a la migración.

## Configuración necesaria en GitHub

Cambiar `Settings → Pages → Build and deployment → Source` a **GitHub Actions**. Mientras permanezca `Deploy from a branch`, GitHub seguirá utilizando el flujo automático anterior.

## Configuración necesaria en Supabase

Ejecutar en orden:

1. `sql/2026-07-09_v7_2_0_stabilization.sql`
2. `sql/2026-07-09_v7_2_0_verify.sql`

La segunda consulta debe devolver `OK` en todos los controles antes de probar ventas.
