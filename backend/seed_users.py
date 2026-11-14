import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth.models import User
from tienda.models import PerfilUsuario


def run():
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

        estado = "creado" if created else "actualizado"
        print(f"Usuario '{user.username}' ({perfil.rol}) {estado} correctamente.")


if __name__ == "__main__":
    run()