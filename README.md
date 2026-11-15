# Papel y Luna — POS MVP 3

Sistema de punto de venta para una papelería, con frontend HTML/CSS/JavaScript vanilla y backend Django REST Framework.

## Arquitectura

```text
Navegador → fetch / API REST Django → servicios de negocio → base relacional
```

El navegador administra la interacción y muestra una vista previa de los importes. El backend comprueba sesión y permisos, calcula los importes oficiales y ejecuta ventas, compras, correcciones y reembolsos en transacciones.

- SQLite cuando no se configura `DATABASE_URL`.
- Base definida por `DATABASE_URL` cuando existe; la configuración contempla PostgreSQL.
- Google Sheets y `AppsScript.gs` corresponden a MVP 2 y no participan en el flujo actual.
- `localStorage` se utiliza únicamente para borradores de interfaz separados por usuario.

## Funcionalidades

- POS, pagos Efectivo/Nequi/Debe, recibido, cambio y factura imprimible/PDF.
- Ventas abiertas: guardar, retomar y cerrar conservando el ID.
- Historial compacto con detalle, correcciones y reembolsos.
- Inventario transaccional: ventas, compras, correcciones diferenciales y devoluciones de reembolsos.
- CRUD de productos, categorías, clientes y proveedores, con protección de relaciones.
- Creación contextual de clientes/productos desde POS y de proveedores/productos desde Compras.
- Descuentos reutilizables y descuentos puntuales de factura, fijos o porcentuales, sin totales negativos.
- Faltantes, agrupación de solicitudes pendientes, filtros y resolución.
- Reportes por fecha.
- Autenticación por sesión y roles administrador/cajero.
- Formularios en modales, confirmaciones, foco/teclado, skeletons y diseño responsive.

Según P3.1 §3.8, el cajero puede editar nombre, categoría, precio y costo desde el POS. No puede administrar el catálogo ni modificar código/inventario. Definir descuentos puntuales nuevos es una acción de administrador; el cajero puede aplicar los descuentos existentes.

## Tecnologías

HTML5, CSS3, JavaScript vanilla, Python, Django, Django REST Framework, django-cors-headers, python-dotenv, dj-database-url, psycopg, Gunicorn y WhiteNoise. No hay compilación ni dependencias npm del frontend.

## Ejecución local — Windows

Desde la raíz del repositorio, con Python instalado:

```powershell
python -m venv .venv
& .venv/Scripts/python.exe -m pip install -r requirements.txt
& .venv/Scripts/python.exe backend/manage.py migrate
```

Si necesitas variables de entorno, crea `.env` a partir de `.env.example` sin sobrescribir una configuración existente. Deja `DATABASE_URL` vacío para SQLite local. No subas `.env` ni bases de datos a Git.

Opcional, solo para una base de demostración:

```powershell
Push-Location backend
& ../.venv/Scripts/python.exe seed_users.py
Pop-Location
```

El script crea los usuarios y, si no hay productos, datos iniciales. **Cada ejecución vuelve a establecer las contraseñas demo**; no lo ejecutes sin revisar en un entorno con usuarios reales.

```powershell
& .venv/Scripts/python.exe backend/manage.py runserver 127.0.0.1:8000
```

Abrir `http://127.0.0.1:8000/`. Django sirve la interfaz y `/api/` desde el mismo origen. No es necesario iniciar Live Server.

### Usuarios de demostración del script

| Rol | Usuario | Contraseña local de demostración |
|---|---|---|
| Administrador | admin | AdminDemo2026! |
| Cajero | cajero | CajeroDemo2026! |

Estos valores describen el script del repositorio; no confirman las credenciales del servicio desplegado.

## API y organización

`js/api.js` centraliza las peticiones REST, timeout, cookies de sesión y errores HTTP. Los recursos principales son `productos`, `categorias`, `clientes`, `proveedores`, `ventas`, `compras`, `descuentos`, `faltantes` y `reportes`.

| Ubicación | Responsabilidad |
|---|---|
| index.html / css/Style.css | Vistas, formularios, responsive y presentación |
| js/app.js | Sesión, navegación, conexión de eventos, descuentos de catálogo, faltantes y reportes |
| js/pos.js | Carrito, cálculo de vista previa, pagos y cierre/corrección |
| js/productos.js / clientes.js / gestion.js | Formularios y operaciones CRUD reutilizados |
| js/compras.js | Registro y consulta de compras |
| js/historial.js / ventas-abiertas.js | Consulta, impresión, reembolsos y recuperación de abiertas |
| js/borrador-venta.js | Borradores locales por usuario, sin catálogo persistido |
| js/ui.js / loading.js | Diálogos, foco, confirmaciones, indicadores y skeletons |
| backend/config/ | Configuración, rutas raíz y entrada WSGI |
| backend/tienda/urls.py | Rutas REST |
| backend/tienda/views.py / permissions.py | Peticiones, sesión y autorización |
| backend/tienda/serializers.py | Transformación JSON y validación de CRUD |
| backend/tienda/services.py | Reglas del negocio y transacciones |
| backend/tienda/models.py / migrations/ | Tablas, relaciones y evolución del esquema |
| backend/tienda/tests.py | Pruebas automatizadas del backend |

Los importes se guardan en pesos enteros. El IVA se redondea al peso más cercano y el descuento se aplica al total con IVA, con piso de cero. La factura conserva los datos históricos del descuento.

El campo opcional `descuentoPersonalizado: { tipo, valor }` permite un descuento puntual sin crear registros en el catálogo. Se utiliza en las rutas de venta existentes; no requiere una migración de base de datos.

## Pruebas y guía de estudio

```powershell
& .venv/Scripts/python.exe backend/manage.py test tienda
```

Para ejecutar Chrome contra una base desechable, iniciar en otra terminal:

```powershell
& .venv/Scripts/python.exe tests/serve-mvp3.py
```

Y luego, con Chrome instalado y Node con WebSocket global:

```powershell
node tests/run-browser.cjs 1366 --mvp3
node tests/run-browser.cjs 768 --mvp3
node tests/run-browser.cjs 390 --mvp3
```

El servidor de pruebas usa SQLite temporal en el puerto 8765, sin tocar la base local ni Render. Terminarlo con Ctrl+C.

- [Guía técnica para estudiar el proyecto](docs/GUIA_TECNICA_MVP3.md).
- [Diagnóstico, cambios, pruebas y validación manual](docs/AUDITORIA_UX_MVP3.md).

Las pruebas de `post-mvp2.test.cjs` y `browser-post-mvp2.js` corresponden al contrato anterior de Apps Script; no se presentan como pruebas de la API Django.

## Despliegue y límites conocidos

El código contempla Render, pero el despliegue no se ha verificado desde esta revisión. La presencia de Gunicorn o de `.onrender.com` en la configuración no demuestra que el servicio esté publicado.

| Dirección | Valor |
|---|---|
| Frontend | Pendiente de completar/verificar |
| Backend/API | Pendiente de completar/verificar |
| Comprobación del servicio | `/api/health/` |

Antes de publicar, verificar variables de entorno, `DEBUG=False`, `SECRET_KEY`, base de datos, hosts y sesión/HTTPS. La autenticación actual exime CSRF: es una limitación que requiere revisión antes de operar con datos reales.

Los tests con SQLite no prueban la concurrencia por filas de PostgreSQL. Una respuesta perdida y los movimientos concurrentes requieren validación adicional en el despliegue. No se recupera automáticamente como nueva una venta cuyo guardado quedó incierto; se advierte al usuario para revisar el historial.

## Integrantes

- Juan
- Jacobo
- Jero

Completar los nombres completos y las URLs verificadas para la entrega.

## Entrega del curso

Según P3.1, conservar el mismo repositorio con contribuciones visibles de los integrantes y entregar `web-2026-2-mvp3-apellidoA-apellidoB-apellidoC.zip` con frontend, backend, README e inicialización. Excluir `.git/`, `.venv/`, bases de datos, secretos, cachés y archivos generados de pruebas.
