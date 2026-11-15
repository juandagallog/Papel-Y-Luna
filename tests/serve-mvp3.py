"""Servidor de pruebas aislado. Nunca utiliza la BD local ni la de Render.
Ejecutar desde la raíz: .venv/Scripts/python tests/serve-mvp3.py
"""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
from django.conf import settings

TEMP = Path(tempfile.mkdtemp(prefix="papel-luna-e2e-"))
settings.DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": TEMP / "test.sqlite3"}}
settings.ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
settings.DEBUG = True
settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # Solo datos temporales.
settings.STATIC_ROOT = TEMP / "static"
settings.STATIC_ROOT.mkdir()
import django
django.setup()
from django.core.management import call_command
from django.contrib.auth.models import User
from tienda.models import PerfilUsuario, Categoria, Producto, Proveedor, Cliente, Descuento

call_command("migrate", verbosity=0)
for rol, nombre in (("ADMIN", "admin_ux"), ("CAJERO", "cajero_ux")):
    user = User.objects.create_user(username=nombre, password="SoloPruebas123!", first_name=nombre)
    PerfilUsuario.objects.create(usuario=user, rol=rol)
categoria = Categoria.objects.create(id="ux-cat", nombre="Papelería")
Proveedor.objects.create(id="ux-prov", nombre="Distribuidora Escolar", telefono="3001234567")
Cliente.objects.create(id="ux-cli", nombre="Ana & Luna", telefono="3007654321")
Producto.objects.create(id="ux-prod", codigo="PROD-001", nombre="Cuaderno", categoria=categoria,
                        precio=150, costo=50, stock=50, seguimiento_inventario=True)
Producto.objects.create(id="ux-servicio", codigo="PROD-002", nombre="Impresión", categoria=categoria,
                        precio=100, costo=20, stock=0, seguimiento_inventario=False)
Producto.objects.create(id="ux-agotado", codigo="PROD-003", nombre="Lápiz agotado", categoria=categoria,
                        precio=100, costo=50, stock=0, seguimiento_inventario=True)
Descuento.objects.create(id="ux-desc", nombre="Bono escolar", tipo="fijo", valor=50)
print("Servidor E2E aislado: http://127.0.0.1:8765 | BD temporal:", TEMP, flush=True)
call_command("runserver", "127.0.0.1:8765", use_reloader=False, verbosity=0)
