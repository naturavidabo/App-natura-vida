INFORME DE CONVERSIÓN — MI NEGOCIO → NATURA VIDA

Archivo analizado:
backup_2026-07-09 22_28.mn

Formato real encontrado:
- Archivo .mn = paquete ZIP.
- Base interna = SQLite (BD_MiNegocio).
- También contiene 3 imágenes de productos.

Datos recuperados:
- Clientes normalizados: 39
- Ventas históricas: 69
- Líneas de productos vendidas: 136
- Total histórico: Bs 72,750.50
- Primera venta: 06/06/2025
- Última venta: 29/06/2026
- Números de celular encontrados: 0

IMPORTANTE SOBRE LOS TELÉFONOS
La tabla de clientes sí tiene un campo telefono1, pero todos los registros del respaldo recibido están vacíos.
No se inventó ningún número. Los clientes se importarán con el nombre y el teléfono vacío.

CRITERIOS DE MIGRACIÓN
- Las ventas se marcan como históricas.
- Las ventas importadas NO modifican el stock actual.
- Se conservan fechas, horas, productos, cantidades, precios de compra, precios de venta, subtotales, total, forma de pago antigua y observaciones.
- Los folios originales se conservan como MN-000007, MN-000008, etc.
- La importación es repetible sin duplicar datos.
- Se normalizaron espacios, acentos y puntuación para evitar algunos duplicados evidentes.
- No se fusionaron nombres ambiguos como GUISELA, SRA GUISELA y GUISELA TABORGA.

RESULTADO ESPERADO
Después de ejecutar el SQL en Supabase y actualizar la aplicación:
- Los clientes aparecerán en Clientes.
- Las 69 ventas aparecerán en Ventas y recibos.
- Podrás abrir nuevamente los recibos históricos.
- El inventario actual permanecerá intacto.
