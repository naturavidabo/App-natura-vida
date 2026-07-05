# Control de Presupuesto B5 — Informe de auditoría y pruebas

Fecha de verificación: 5 de julio de 2026

## Dictamen

La B5 reemplaza la dependencia principal de `localStorage` por IndexedDB y no muestra una base vacía cuando falla la lectura de datos existentes. La versión fue sometida a pruebas automatizadas en Chromium real mediante un servidor local. Las pruebas detalladas abajo finalizaron correctamente y sin errores JavaScript no controlados.

Esto no elimina riesgos externos como borrar manualmente los datos del sitio, restablecer el teléfono, perder el dispositivo o cambiar de dirección web. Para esos casos se mantiene el respaldo externo JSON.

## Arquitectura de persistencia implementada

- Base principal: IndexedDB `control_presupuesto_b5`.
- Almacenes separados: gastos, categorías, favoritos, proyectos, presupuestos mensuales, metadatos, instantáneas y auditoría.
- Guardado transaccional con durabilidad estricta cuando el navegador la admite.
- Número de revisión para bloquear sobrescrituras desde pestañas antiguas.
- Suma SHA-256 de integridad del estado completo.
- Verificación posterior en cada inicio.
- Instantánea interna automática después de cada modificación confirmada.
- Conservación de hasta 20 instantáneas válidas.
- Copia secundaria doble en `localStorage`: actual y anterior.
- Migración automática desde la clave de la B4 `control_presupuesto_v1`.
- La clave antigua de la B4 no se elimina.
- Protección contra reemplazar una base con datos por una base vacía.
- Pantalla de recuperación bloqueante si la base falla y no existe una copia válida.
- Papelera para gastos eliminados.
- Respaldo JSON con SHA-256 y rechazo de archivos alterados.
- Exportación CSV para Excel separada del respaldo completo.
- Solicitud de almacenamiento persistente mediante `navigator.storage.persist()`.
- Actualización del Service Worker sin recarga automática; primero verifica y crea una instantánea.

## Activación

- Código autorizado comprobado mediante huella SHA-256; el código no aparece escrito directamente en la lógica.
- La activación se guarda solamente en el dispositivo.
- No se incluye en respaldos JSON ni CSV.
- Cinco intentos incorrectos producen bloqueo de un minuto.
- La importación de información no activa otro dispositivo.

## Pruebas ejecutadas y aprobadas

1. Inicio nuevo y pantalla de activación.
2. Rechazo de código incorrecto.
3. Activación con el código autorizado.
4. Persistencia de la activación al recargar y cerrar la pestaña.
5. Configuración y persistencia de presupuesto y objetivo de ahorro.
6. Registro de gasto con confirmación real de IndexedDB.
7. Persistencia del gasto al recargar.
8. Persistencia del gasto al cerrar y abrir una nueva pestaña.
9. Funcionamiento sin internet después de instalar el Service Worker.
10. Favoritos: tocar no descuenta directamente; abre confirmación.
11. Eliminación a papelera y restauración.
12. Verificación manual de integridad.
13. Migración de datos de la B4, preservando la clave antigua.
14. Corrupción simulada del almacén de gastos y recuperación desde instantánea interna.
15. Eliminación simulada de IndexedDB y recuperación desde copia secundaria local.
16. Corrupción sin copias disponibles: la app bloquea la interfaz y no muestra ceros.
17. Uso simultáneo en dos pestañas: una revisión antigua no sobrescribe la nueva.
18. Reintento posterior y conservación de ambos gastos.
19. Creación de respaldo JSON completo.
20. Reinicio de datos y restauración desde el respaldo.
21. Rechazo de respaldo modificado por suma SHA-256 incorrecta.
22. Importación y persistencia de 1.000 gastos.
23. Recarga con 1.000 gastos sin pérdida de información.
24. Registro retroactivo con fecha y hora manuales.
25. Conservación de gastos de un mes anterior en el historial.
26. Bloqueo temporal después de cinco códigos incorrectos.
27. Validación estática: sintaxis JavaScript, manifiesto, recursos de PWA, IDs HTML y referencias internas.
28. Revisión visual móvil a 390 × 844 píxeles.

## Resultados de rendimiento de referencia

En el entorno de prueba:

- Importación y guardado de 1.000 gastos: aproximadamente 2,5 segundos.
- Recarga posterior con 1.000 gastos: aproximadamente 0,75 segundos.
- Almacenamiento utilizado por esa prueba: aproximadamente 0,34 MB.

Estos tiempos dependen del celular y del navegador.

## Límites que siguen existiendo

Ninguna app completamente local puede recuperar datos si se eliminan a la vez IndexedDB, `localStorage` y los respaldos externos. Esto puede ocurrir al borrar manualmente todos los datos del sitio, restablecer el teléfono o perderlo. Por eso la B5 incluye recordatorio visual y botón de respaldo completo.

La activación offline es un control práctico de autorización. Al ser código público en GitHub Pages, una persona con conocimientos técnicos podría modificar el JavaScript; una licencia inviolable requeriría validación en servidor.

## Recomendación de publicación

Publicar primero la B5 en el mismo repositorio y dirección de GitHub Pages para permitir la migración automática de la B4. Antes de borrar o desinstalar cualquier versión anterior, verificar en Configuración:

- cantidad de gastos;
- revisión;
- copia interna;
- copia secundaria;
- estado de integridad.

Después, crear un respaldo JSON externo de prueba.
