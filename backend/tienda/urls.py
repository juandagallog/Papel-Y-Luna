from django.urls import path
from .views import (
    LoginView,
    LogoutView,
    SessionView,
    CategoriaListCreateView,
    CategoriaDetailView,
    ProveedorListCreateView,
    ProveedorDetailView,
    ClienteListCreateView,
    ClienteDetailView,
    ProductoListCreateView,
    ProductoDetailView,
    DescuentoListCreateView,
    DescuentoDetailView,
    VentaListCreateView,
    VentaDetailView,
    VentaCorregirView,
    VentaReembolsoView,
    CompraListCreateView,
    CompraDetailView,
    FaltanteListCreateView,
    FaltanteDetailView,
    FaltantesAgrupadosView,
    ReportesResumenView,
)

urlpatterns = [
    # Autenticación y sesión
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/session/", SessionView.as_view(), name="auth-session"),

    # Catálogos base
    path("categorias/", CategoriaListCreateView.as_view(), name="categorias-list"),
    path("categorias/<str:pk>/", CategoriaDetailView.as_view(), name="categorias-detail"),
    path("proveedores/", ProveedorListCreateView.as_view(), name="proveedores-list"),
    path("proveedores/<str:pk>/", ProveedorDetailView.as_view(), name="proveedores-detail"),
    path("clientes/", ClienteListCreateView.as_view(), name="clientes-list"),
    path("clientes/<str:pk>/", ClienteDetailView.as_view(), name="clientes-detail"),
    path("productos/", ProductoListCreateView.as_view(), name="productos-list"),
    path("productos/<str:pk>/", ProductoDetailView.as_view(), name="productos-detail"),
    path("descuentos/", DescuentoListCreateView.as_view(), name="descuentos-list"),
    path("descuentos/<str:pk>/", DescuentoDetailView.as_view(), name="descuentos-detail"),

    # Ventas, correcciones y reembolsos
    path("ventas/", VentaListCreateView.as_view(), name="ventas-list"),
    path("ventas/<str:pk>/", VentaDetailView.as_view(), name="ventas-detail"),
    path("ventas/<str:pk>/corregir/", VentaCorregirView.as_view(), name="ventas-corregir"),
    path("ventas/<str:pk>/reembolsos/", VentaReembolsoView.as_view(), name="ventas-reembolsos"),

    # Compras
    path("compras/", CompraListCreateView.as_view(), name="compras-list"),
    path("compras/<str:pk>/", CompraDetailView.as_view(), name="compras-detail"),

    # Faltantes
    path("faltantes/", FaltanteListCreateView.as_view(), name="faltantes-list"),
    path("faltantes/agrupados/", FaltantesAgrupadosView.as_view(), name="faltantes-agrupados"),
    path("faltantes/<str:pk>/", FaltanteDetailView.as_view(), name="faltantes-detail"),

    # Reportes
    path("reportes/", ReportesResumenView.as_view(), name="reportes-resumen"),
]