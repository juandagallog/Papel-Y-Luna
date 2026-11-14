import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth.models import User
from tienda.models import (
    PerfilUsuario,
    Categoria,
    Proveedor,
    Cliente,
    Producto,
    Descuento,
)


def run():
    # 1. Usuarios iniciales (Administrador y Cajero)
    usuarios_demo = [
        {
            "username": "admin",
            "password": "AdminDemo2026!",
            "first_name": "Administrador Papel y Luna",
            "rol": PerfilUsuario.ROL_ADMIN,
            "is_staff": True,
        },
        {
            "username": "cajero",
            "password": "CajeroDemo2026!",
            "first_name": "Cajero Papel y Luna",
            "rol": PerfilUsuario.ROL_CAJERO,
            "is_staff": False,
        },
    ]

    for datos in usuarios_demo:
        user, created = User.objects.get_or_create(
            username=datos["username"],
            defaults={
                "first_name": datos["first_name"],
                "is_staff": datos["is_staff"],
            },
        )
        user.first_name = datos["first_name"]
        user.is_staff = datos["is_staff"]
        user.set_password(datos["password"])
        user.save()

        perfil, _ = PerfilUsuario.objects.get_or_create(usuario=user)
        perfil.rol = datos["rol"]
        perfil.save()
        print(f"Usuario '{user.username}' ({perfil.rol}) listo.")

    # 2. Semilla de Catálogo Base (solo si aún no hay productos)
    if Producto.objects.exists():
        print("El catálogo ya contiene productos; no se sobrescriben.")
        return

    cat_escritura, _ = Categoria.objects.get_or_create(
        id="cat-escritura", defaults={"nombre": "Escritura"}
    )
    cat_papeleria, _ = Categoria.objects.get_or_create(
        id="cat-papeleria", defaults={"nombre": "Papelería y Cuadernos"}
    )
    cat_oficina, _ = Categoria.objects.get_or_create(
        id="cat-oficina", defaults={"nombre": "Oficina y Escolar"}
    )

    Proveedor.objects.get_or_create(
        id="prov-norma",
        defaults={
            "nombre": "Distribuidora Papelería Mayorista",
            "telefono": "3001234567",
            "correo": "pedidos@mayoristapapel.co",
        },
    )

    Cliente.objects.get_or_create(
        id="cli-frecuente",
        defaults={
            "nombre": "María Fernanda Gómez",
            "telefono": "3159876543",
            "correo": "mafe.gomez@correo.co",
        },
    )

    Descuento.objects.get_or_create(
        id="desc-estudiante-10",
        defaults={
            "nombre": "Descuento Estudiante 10%",
            "tipo": Descuento.TIPO_PORCENTAJE,
            "valor": 10,
        },
    )

    productos_iniciales = [
        ("PROD-001", "Bolígrafos de Gel", cat_escritura, 4500, 2500, 30, "Caja de bolígrafos tinta gel suave", "imagenes/BoligrafosGel.jpg"),
        ("PROD-002", "Borrador de Nata", cat_oficina, 1500, 700, 50, "Borrador blanco que no mancha", "imagenes/Borrador.jpg"),
        ("PROD-003", "Calculadora Científica", cat_oficina, 38000, 24000, 12, "Calculadora de 240 funciones", "imagenes/Calculadora.jpg"),
        ("PROD-004", "Carpeta Organizadora", cat_papeleria, 12000, 7200, 20, "Carpeta plástica tamaño oficio con fuelle", "imagenes/CarpetaOrganizadora.jpg"),
        ("PROD-005", "Cinta Adhesiva Transparente", cat_oficina, 3200, 1600, 40, "Rollo de cinta transparente multiusos", "imagenes/CintaAdhesiva.jpg"),
        ("PROD-006", "Cuaderno Estilo Moleskine", cat_papeleria, 25000, 15000, 18, "Libreta pasta dura 100 hojas", "imagenes/CuadernoMoleskine.jpg"),
        ("PROD-007", "Marcadores Permanentes x4", cat_escritura, 14000, 8500, 25, "Set de 4 marcadores punta fina", "imagenes/MarcadoresPermanentes.jpg"),
        ("PROD-008", "Notas Adhesivas Colores", cat_papeleria, 5500, 3000, 35, "Taco de notas adhesivas 76x76mm", "imagenes/NotasAdhesivas.jpg"),
        ("PROD-009", "Regla Metálica 30 cm", cat_oficina, 4000, 2000, 28, "Regla de aluminio graduada en milímetros", "imagenes/ReglaMetal.jpg"),
        ("PROD-010", "Resaltadores Pastel x6", cat_escritura, 16500, 9800, 22, "Estuche de resaltadores tonos pastel", "imagenes/ResaltadoresPastel.jpg"),
        ("PROD-011", "Sacapuntas Metálico con Depósito", cat_oficina, 2800, 1300, 45, "Sacapuntas doble servicio", "imagenes/Sacapuntas.jpg"),
        ("PROD-012", "Tijeras Punta Roma", cat_oficina, 5000, 2600, 30, "Tijeras escolares acero inoxidable", "imagenes/Tijeras.jpg"),
    ]

    for codigo, nombre, cat, precio, costo, stock, desc, img in productos_iniciales:
        Producto.objects.create(
            id=f"seed-{codigo.lower()}",
            codigo=codigo,
            nombre=nombre,
            categoria=cat,
            precio=precio,
            costo=costo,
            seguimiento_inventario=True,
            stock=stock,
            descripcion=desc,
            imagenes=img,
        )

    print("Catálogo inicial de 12 productos precargado correctamente.")


if __name__ == "__main__":
    run()