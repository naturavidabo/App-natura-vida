NATURA VIDA V7.2.3 — CLIENTES, MAYORISTAS Y RECIBOS LIMPIOS

Cambios principales:
- Selector propio de clientes dentro de la venta: ya no depende del autocompletado horizontal del teclado/navegador.
- En venta unitaria se muestran primero clientes unitarios, mixtos y sin clasificar.
- En venta mayorista se muestran primero mayoristas, mixtos y sin clasificar.
- Botón Ver todos dentro del selector para casos excepcionales.
- Al seleccionar cliente, se cargan juntos nombre y teléfono desde la misma ficha.
- Botón WhatsApp con código Bolivia +591 aplicado automáticamente.
- Ficha mayorista ligera: nombre de tienda/cliente, celular, ciudad, dirección, GPS, foto de tienda y observaciones.
- Estado comercial automático: Nuevo, En seguimiento, Recurrente, Consolidado o Inactivo.
- Saneamiento de clientes duplicados por teléfono o nombre parecido.
- Fusión de duplicados: conserva el nombre más completo, une historial de ventas y elimina duplicados.
- Recibo V7 limpio: se eliminó el texto técnico de Supabase y se reubicó el QR para no tapar el contenido.
- Se mantiene precio manual por producto, rebajas, recargos, estadísticas y migración Mi Negocio.

Notas:
- No requiere SQL nuevo para usar la app.
- La migración consolidada de Mi Negocio está incluida en migration-mi-negocio-consolidado.
- Si quieres importar el historial consolidado, ejecuta el SQL consolidado opcional en Supabase.
