# Auditoría y mejoras de usabilidad — MVP 3

Trabajo realizado en `mejoras/ux-mvp3`, partiendo de `mvp3` sin cambios locales pendientes. No se hicieron commits, push ni despliegue.

## Diagnóstico y decisiones

| Hallazgo | Clasificación | Intervención |
|---|---|---|
| Todos los botones deshabilitados mostraban cursor de espera | Confirmado en CSS | `not-allowed` para restricciones; progreso solo cuando hay carga explícita. Corregir con reembolsos explica la causa. |
| Corrección repetida | No se reprodujo un bloqueo incondicional | Pruebas de correcciones sucesivas; lectura fresca antes de abrir y liberación en `finally`. El historial se espera tras guardar. |
| Cajero edita desde POS | Comportamiento requerido por P3.1 §3.8 | Se conserva. Servidor restringe los campos admitidos y rechaza inventario/código/IDs distintos. |
| Precio/costo `step=50` | Error confirmado en navegador | `step=1`, coherente con los pesos enteros admitidos por la API. Un costo 60 deja de bloquear el formulario. |
| Redondeo Python/JavaScript | Error confirmado por prueba de subtotal 150 | IVA 29 y total 179 en ambos. Cálculo entero en servidor sin coma flotante. |
| Login lento al escribir | No reproducido en el equipo del usuario | Sin handlers de red por pulsación. Se retiró desenfoque y se oculta el fondo; Chrome verifica que escribir no crea peticiones. Falta validar la percepción en el dispositivo afectado. |
| Confirmaciones nativas | Confirmado; no se encontraron `alert()` en producción | Modal asíncrono común; éxito/error/advertencia/información diferenciados. |
| Formularios de clientes/proveedores alejados de la fila | Confirmado | Se trasladan los formularios existentes a modales; no se duplican los servicios. |
| Historial extenso | Confirmado | Ventas cerradas plegadas en resumen; detalle conserva datos, impresión y operaciones. |
| Faltantes con información repetida | Confirmado | Formulario y resultados en columnas, campos por tipo, ayuda progresiva y tarjetas en móvil. |
| Texto de usuarios interpolado como HTML | Riesgo confirmado por lectura | Escape en los templates modificados y prueba con nombre/descripción que contiene etiquetas HTML. |
| Logout mostraba login aun cuando fallaba la petición | Confirmado en `finally` | Solo cambia la sesión visual tras éxito; conserva usuario y muestra error ante fallo. |
| Filtros de faltantes y fechas de reportes se perdían | Confirmado: wrapper GET solo reenviaba el recurso | `loading.js` reenvía todos los argumentos a la API; se verifica la query string real en Chrome. |

## Alcance implementado

- Cliente nuevo desde el POS, seleccionado al confirmar, conservando la factura.
- Producto nuevo desde POS solo para administrador, reutilizando el modal; se agrega a la venta si tiene disponibilidad.
- Descuentos puntuales fijos/porcentuales con validación de servidor y sin filas permanentes de catálogo.
- Formularios de edición compartidos, foco inicial, devolución de foco, Tab y Escape.
- Enter permite enviar formularios válidos; en el recibido mueve el foco, sin confirmar una venta.
- Bloqueo temporal de doble envío en login, reembolso, faltantes y guardado de descuentos.
- Skeletons de resumen de ventas, catálogos y tablas; fondo de login sin desenfoque.
- Borrador separado por usuario; no se guarda una corrección como venta nueva. Se conservan descuentos del borrador y se amortiza la escritura al introducir el recibido.
- Paleta verde/papel, jerarquía de botones, tablas legibles y movimiento reducido.

No cambiaron modelos, migraciones, rutas, `api.js`, Apps Script ni las dependencias declaradas. El descuento puntual añade un campo opcional al cuerpo de las operaciones de venta ya existentes, `descuentoPersonalizado: { tipo, valor }`; los clientes que usan `descuentoId` siguen funcionando.

## Archivos

| Grupo | Archivos |
|---|---|
| Servidor | `backend/tienda/services.py`, `views.py`, `tests.py` |
| Interfaz | `index.html`, `css/Style.css`, `js/ui.js` (nuevo), `app.js`, `pos.js`, `productos.js`, `clientes.js`, `gestion.js`, `historial.js`, `ventas-abiertas.js`, `borrador-venta.js`, `loading.js` |
| Pruebas | `tests/run-browser.cjs`, `tests/browser-mvp3.js` (nuevo), `tests/serve-mvp3.py` (nuevo) |
| Documentación | `README.md`, esta auditoría y `GUIA_TECNICA_MVP3.md` |

## Pruebas ejecutadas

- Referencia inicial: 7 pruebas originales de Django, correctas.
- Suite ampliada: 16 pruebas Django, correctas; incluye correcciones sucesivas, restricciones del cajero, descuentos puntuales, total cero, porcentaje, reembolso proporcional y rollback ante descuento inválido.
- Chrome con Django real y SQLite temporal: flujos de login, cliente/producto contextual, descuentos, correcciones repetidas, reembolso, compra múltiple, edición contextual, faltantes, error de logout, cajero, abierta tras recarga y borrador. Viewports 1366, 768 y 390 px.
- Se validó contenido del HTML de factura; no se imprimió en una impresora física ni se exportó un PDF desde el diálogo del sistema.
- Los payloads de prueba con etiquetas se mantienen como texto y no ejecutan código.
- Verificaciones de sintaxis, referencias HTML y espacios de Git realizadas al finalizar.

Las pruebas antiguas `post-mvp2.test.cjs` y `browser-post-mvp2.js` simulan el contrato anterior y se conservan como material histórico. No se presentan como regresión del backend nuevo.

### Repetir las pruebas

Desde la raíz, con las dependencias del proyecto instaladas en `.venv`:

```powershell
& .venv/Scripts/python.exe backend/manage.py test tienda
```

En otra terminal, iniciar el servidor aislado (no utiliza la base local ni Render):

```powershell
& .venv/Scripts/python.exe tests/serve-mvp3.py
```

Con Chrome instalado y Node con WebSocket global:

```powershell
node tests/run-browser.cjs 1366 --mvp3
node tests/run-browser.cjs 768 --mvp3
node tests/run-browser.cjs 390 --mvp3
```

El driver inyecta pruebas solo en el servidor local 8765 y guarda las capturas en una carpeta temporal. Las contraseñas y el hasher rápido del servidor de prueba pertenecen únicamente a la base desechable. Terminar ese servidor con Ctrl+C.

## Validación manual

1. Login: escribir, usar Enter, probar contraseña incorrecta y correcta. Comprobar foco, error y botón liberado.
2. POS: preparar factura, crear cliente, corregir correo inválido y confirmar; el cliente queda seleccionado y el carrito permanece.
3. Administrador: crear producto desde POS con costo 60 y precio entero; comprobar que se pueda usar inmediatamente y editar otra vez.
4. Aplicar descuento puntual fijo mayor al total: debe quedar cero en POS, backend y factura. Repetir con porcentaje. No aparece un descuento nuevo en el catálogo.
5. Corregir la misma venta dos veces; comprobar ID, usuario/fecha, total y stock diferencial. Tras un reembolso, revisar la explicación del bloqueo.
6. Editar cliente/proveedor desde su fila; comprobar valores, cancelar con Escape, foco de retorno y conservación del formulario ante error.
7. Cajero: conservar edición en caliente, bloquear código/stock y creación; puede vender, aplicar descuentos existentes y gestionar clientes/faltantes.
8. Faltantes: alternar tipo, registrar, filtrar y resolver; comprobar agrupación y vista móvil.
9. Compras: varios productos, proveedor contextual, total y stock/costos; revisar el detalle.
10. Historial: desplegar detalles, imprimir o guardar PDF y comprobar importes y marcas. Probar en un móvil real.

## Límites y revisión humana

- Descuento puntual nuevo reservado al administrador: no se amplían los permisos del cajero para definir descuentos.
- La prohibición de corregir ventas con reembolsos es una regla preexistente del backend. No se añadió prohibición de una segunda corrección.
- Los borradores anteriores sin usuario no se migran automáticamente al espacio de otro usuario.
- Falta medir el retraso de escritura en el navegador/dispositivo donde se reportó; el test no demuestra el rendimiento de ese equipo.
- No se comprobó Render, PostgreSQL, usuarios reales ni concurrencia entre operadores. SQLite no reproduce los bloqueos por fila de PostgreSQL.
- La exención CSRF de la autenticación por sesión es preexistente y requiere revisión antes de operar con datos reales; no se ha presentado como seguridad de producción completa.
- El aislamiento entre ventas abiertas y borrador se conserva: los cambios de una abierta retomada deben guardarse remotamente antes de recargar.
