# Papel y Luna — MVP3

Sistema de punto de venta y gestión de inventario para una papelería.

## Tecnologías

- **Frontend:** HTML, CSS y JavaScript Vanilla.
- **Backend:** Python, Django y Django REST Framework.
- **Base de datos:** SQLite para instalación local y PostgreSQL para producción.
- **Despliegue:** Render.

## Requisitos

- Python instalado.
- pip.
- Conexión a internet para instalar las dependencias.

## Instalación local

1. Descomprimir el proyecto.
2. Abrir una terminal en la carpeta raíz.
3. Crear y activar un entorno virtual:

4. Instalar las dependencias:

5. Inicializar una base de datos SQLite nueva con el archivo SQL incluido:

```powershell
python -c "import sqlite3; c=sqlite3.connect('backend/db.sqlite3'); c.executescript(open('inicializacion_sqlite.sql',encoding='utf-8').read()); c.close()"
```

**Nota:** el archivo `backend/db.sqlite3` no debe existir antes de realizar este paso. El SQL ya incluye la estructura y los registros iniciales; no ejecutar `migrate` antes de importarlo.

6. Ejecutar el servidor:

```powershell
python backend/manage.py runserver
```

7. Abrir la aplicación:

http://127.0.0.1:8000/

## Usuarios de demostración

**Administrador**
- Usuario: [admin]
- Contraseña: [AdminDemo2026!]

**Cajero**
- Usuario: [cajero]
- Contraseña: [CajeroDemo2026!]

## Funcionalidades

- Autenticación y autorización por roles.
- Punto de venta con distintos métodos de pago.
- Productos, categorías y clientes.
- Ventas abiertas y cerradas.
- Descuentos, correcciones y reembolsos.
- Inventario, compras y proveedores.
- Registro de faltantes.
- Reportes y estadísticas.
- Interfaz adaptable a dispositivos móviles.

## Proyecto desplegado

**URL de Render:** [[URL](https://papel-y-luna-3y0i.onrender.com)]

La versión desplegada utiliza PostgreSQL. La instalación local incluida en esta entrega utiliza SQLite.

## Información adicional

La aplicación utiliza las sesiones de Django para realizar la autenticación y una API REST implementada con Django REST Framework.
