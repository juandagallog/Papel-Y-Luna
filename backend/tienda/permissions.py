from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import BasePermission, SAFE_METHODS
from .models import PerfilUsuario


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    Autenticación basada en la sesión de Django (cookie sessionid)
    sin bloqueo de CSRF para clientes SPA / fetch y pruebas en Postman.
    """

    def enforce_csrf(self, request):
        return


def obtener_rol_usuario(user):
    if not user or not user.is_authenticated:
        return None
    perfil = getattr(user, "perfil", None)
    if perfil and perfil.rol:
        return perfil.rol
    if user.is_superuser or user.is_staff:
        return PerfilUsuario.ROL_ADMIN
    return PerfilUsuario.ROL_CAJERO


def es_admin(user):
    return obtener_rol_usuario(user) == PerfilUsuario.ROL_ADMIN


class EsAdminOCajero(BasePermission):
    message = "Debes iniciar sesión para realizar esta operación."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and obtener_rol_usuario(request.user)
            in (PerfilUsuario.ROL_ADMIN, PerfilUsuario.ROL_CAJERO)
        )


class EsAdministrador(BasePermission):
    message = "Acceso denegado: esta operación requiere rol de Administrador."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and es_admin(request.user)
        )


class PermisoLecturaCajeroEscrituraAdmin(BasePermission):
    """
    Permite lectura (GET, HEAD, OPTIONS) tanto a Administrador como a Cajero,
    pero restringe creación, edición y eliminación exclusivamente al Administrador.
    Usado en: Categorías, Descuentos y Proveedores.
    """

    message = "Acceso denegado: el rol Cajero solo tiene permiso de lectura en este módulo."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return obtener_rol_usuario(request.user) in (
                PerfilUsuario.ROL_ADMIN,
                PerfilUsuario.ROL_CAJERO,
            )
        return es_admin(request.user)


class PermisoProductos(BasePermission):
    """
    Reglas de Productos (Requisito 3.8):
    - GET: Administrador y Cajero.
    - POST (crear) y DELETE (eliminar): Solo Administrador.
    - PUT / PATCH (editar): Administrador puede todo; Cajero puede editar
      productos desde el POS (sin modificar stock ni seguimientoInventario).
    """

    message = "Acceso denegado: solo el Administrador puede crear o eliminar productos."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.method in ("PUT", "PATCH"):
            return obtener_rol_usuario(request.user) in (
                PerfilUsuario.ROL_ADMIN,
                PerfilUsuario.ROL_CAJERO,
            )
        return es_admin(request.user)