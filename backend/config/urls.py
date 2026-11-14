from pathlib import Path
from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse, FileResponse, Http404
from django.urls import path, re_path, include
from django.views.static import serve

PROJECT_ROOT = settings.PROJECT_ROOT


def health_check(request):
    return JsonResponse({
        "success": True,
        "status": "ok",
        "service": "Papel y Luna API - MVP 3",
    })


def frontend_index(request):
    index_path = PROJECT_ROOT / "index.html"
    if not index_path.exists():
        raise Http404("No se encontró index.html")
    return FileResponse(open(index_path, "rb"), content_type="text/html; charset=utf-8")


urlpatterns = [
    path("", frontend_index, name="frontend_index"),
    path("index.html", frontend_index, name="frontend_index_file"),
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health_check"),
    path("api/", include("tienda.urls")),
    # Archivos del frontend (css/, js/, imagenes/)
    re_path(r"^css/(?P<path>.*)$", serve, {"document_root": PROJECT_ROOT / "css"}),
    re_path(r"^js/(?P<path>.*)$", serve, {"document_root": PROJECT_ROOT / "js"}),
    re_path(r"^imagenes/(?P<path>.*)$", serve, {"document_root": PROJECT_ROOT / "imagenes"}),
]