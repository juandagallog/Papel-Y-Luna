from django.contrib.auth import authenticate, login, logout
from django.db.models import Sum, Count
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView, exception_handler

from .models import (
    Categoria,
    Proveedor,
    Cliente,
    Producto,
    Descuento,
    Venta,
    DetalleVenta,
    Compra,
    Reembolso,
    Faltante,
)
from .permissions import (
    obtener_rol_usuario,
    es_admin,
    EsAdministrador,
    EsAdminOCajero,
    PermisoLecturaCajeroEscrituraAdmin,
    PermisoProductos,
)
from .serializers import (
    CategoriaSerializer,
    ProveedorSerializer,
    ClienteSerializer,
    ProductoSerializer,
    DescuentoSerializer,
    VentaSerializer,
    CompraSerializer,
    ReembolsoSerializer,
    FaltanteSerializer,
)
from .services import (
    guardar_o_cerrar_venta,
    corregir_venta_cerrada,
    registrar_reembolso_venta,
    registrar_compra_servicio,
    parsear_rango_fechas,
)


def custom_exception_handler(exc, context):
    """Garantiza que los errores 401/403/404 de DRF incluyan siempre {'message': '...'}."""
    response = exception_handler(exc, context)
    if response is not None and isinstance(response.data, dict):
        if "detail" in response.data and "message" not in response.data:
            response.data["message"] = str(response.data["detail"])
    return response


def formatear_error_serializer(errors):
    if isinstance(errors, dict):
        if "message" in errors:
            msg = errors["message"]
            return str(msg[0]) if isinstance(msg, list) else str(msg)
        for campo, lista in errors.items():
            if isinstance(lista, list) and lista:
                return str(lista[0])
            return str(lista)
    if isinstance(errors, list) and errors:
        return str(errors[0])
    return "Datos inválidos."


def serializar_usuario(user):
    rol = obtener_rol_usuario(user)
    return {
        "id": user.id,
        "username": user.username,
        "nombre": user.first_name or user.username,
        "rol": rol,
        "esAdmin": rol == "ADMIN",
    }


# =====================================================================
# AUTENTICACIÓN Y SESIÓN (Requisito 3.8)
# =====================================================================

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(request.data.get("username") or "").strip()
        password = str(request.data.get("password") or "")

        if not username or not password:
            return Response(
                {"message": "Debes ingresar usuario y contraseña."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request, username=username, password=password)
        if user is None or not user.is_active:
            return Response(
                {"message": "Credenciales inválidas. Verifica tu usuario y contraseña."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        return Response(
            {
                "authenticated": True,
                "user": serializar_usuario(user),
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response(
            {"authenticated": False, "message": "Sesión cerrada correctamente."},
            status=status.HTTP_200_OK,
        )


class SessionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if request.user and request.user.is_authenticated:
            return Response(
                {
                    "authenticated": True,
                    "user": serializar_usuario(request.user),
                },
                status=status.HTTP_200_OK,
            )
        return Response(
            {"authenticated": False, "user": None},
            status=status.HTTP_200_OK,
        )


# =====================================================================
# CLASES BASE CRUD
# =====================================================================

class BaseCatalogoListCreateView(APIView):
    model = None
    serializer_class = None

    def get(self, request):
        objetos = self.model.objects.all()
        serializer = self.serializer_class(objetos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        datos = request.data.copy() if isinstance(request.data, dict) else {}
        pk = str(datos.get("id", "")).strip()

        if pk and self.model.objects.filter(pk=pk).exists():
            return Response(
                {"message": f"Ya existe un registro con id {pk}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.serializer_class(data=datos)
        if serializer.is_valid():
            instancia = serializer.save()
            return Response(
                self.serializer_class(instancia).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(
            {
                "message": formatear_error_serializer(serializer.errors),
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


class BaseCatalogoDetailView(APIView):
    model = None
    serializer_class = None
    mensaje_protegido = "No se puede eliminar este registro porque tiene datos asociados."

    def get_object(self, pk):
        return get_object_or_404(self.model, pk=pk)

    def get(self, request, pk):
        instancia = self.get_object(pk)
        return Response(
            self.serializer_class(instancia).data,
            status=status.HTTP_200_OK,
        )

    def put(self, request, pk):
        return self._actualizar(request, pk, partial=True)

    def patch(self, request, pk):
        return self._actualizar(request, pk, partial=True)

    def _actualizar(self, request, pk, partial=True):
        instancia = self.get_object(pk)
        serializer = self.serializer_class(
            instancia, data=request.data, partial=partial
        )
        if serializer.is_valid():
            actualizado = serializer.save()
            return Response(
                self.serializer_class(actualizado).data,
                status=status.HTTP_200_OK,
            )
        return Response(
            {
                "message": formatear_error_serializer(serializer.errors),
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    def delete(self, request, pk):
        instancia = self.get_object(pk)
        try:
            instancia.delete()
            return Response({"id": pk}, status=status.HTTP_200_OK)
        except ProtectedError:
            return Response(
                {"message": self.mensaje_protegido},
                status=status.HTTP_409_CONFLICT,
            )


# =====================================================================
# CATÁLOGOS CRUD CON PERMISOS POR ROL
# =====================================================================

class CategoriaListCreateView(BaseCatalogoListCreateView):
    permission_classes = [PermisoLecturaCajeroEscrituraAdmin]
    model = Categoria
    serializer_class = CategoriaSerializer


class CategoriaDetailView(BaseCatalogoDetailView):
    permission_classes = [PermisoLecturaCajeroEscrituraAdmin]
    model = Categoria
    serializer_class = CategoriaSerializer
    mensaje_protegido = "No puedes eliminar una categoría usada por productos."


class ProveedorListCreateView(BaseCatalogoListCreateView):
    permission_classes = [PermisoLecturaCajeroEscrituraAdmin]
    model = Proveedor
    serializer_class = ProveedorSerializer


class ProveedorDetailView(BaseCatalogoDetailView):
    permission_classes = [PermisoLecturaCajeroEscrituraAdmin]
    model = Proveedor
    serializer_class = ProveedorSerializer
    mensaje_protegido = "No puedes eliminar un proveedor con compras asociadas."


class ClienteListCreateView(BaseCatalogoListCreateView):
    permission_classes = [EsAdminOCajero]
    model = Cliente
    serializer_class = ClienteSerializer


class ClienteDetailView(BaseCatalogoDetailView):
    permission_classes = [EsAdminOCajero]
    model = Cliente
    serializer_class = ClienteSerializer
    mensaje_protegido = "No puedes eliminar un cliente asociado a una venta."


class ProductoListCreateView(BaseCatalogoListCreateView):
    permission_classes = [PermisoProductos]
    model = Producto
    serializer_class = ProductoSerializer

    def get(self, request):
        productos = Producto.objects.select_related("categoria").all()
        serializer = ProductoSerializer(productos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProductoDetailView(BaseCatalogoDetailView):
    permission_classes = [PermisoProductos]
    model = Producto
    serializer_class = ProductoSerializer
    mensaje_protegido = "No puedes eliminar un producto que ya tiene ventas o compras asociadas."

    def _actualizar(self, request, pk, partial=True):
        instancia = self.get_object(pk)
        datos = request.data.copy() if isinstance(request.data, dict) else {}

        # Si el usuario es CAJERO, solo puede editar producto desde el POS (sin tocar inventario)
        if not es_admin(request.user):
            if "stock" in datos or "seguimientoInventario" in datos or "seguimiento_inventario" in datos:
                return Response(
                    {
                        "message": "El rol Cajero solo puede editar datos básicos del producto desde el POS, no el inventario."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = self.serializer_class(
            instancia, data=datos, partial=partial
        )
        if serializer.is_valid():
            actualizado = serializer.save()
            return Response(
                self.serializer_class(actualizado).data,
                status=status.HTTP_200_OK,
            )
        return Response(
            {
                "message": formatear_error_serializer(serializer.errors),
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


class DescuentoListCreateView(BaseCatalogoListCreateView):
    permission_classes = [PermisoLecturaCajeroEscrituraAdmin]
    model = Descuento
    serializer_class = DescuentoSerializer


class DescuentoDetailView(BaseCatalogoDetailView):
    permission_classes = [PermisoLecturaCajeroEscrituraAdmin]
    model = Descuento
    serializer_class = DescuentoSerializer


# =====================================================================
# VENTAS, VENTAS ABIERTAS, CORRECCIONES Y REEMBOLSOS
# =====================================================================

class VentaListCreateView(APIView):
    permission_classes = [EsAdminOCajero]

    def get(self, request):
        ventas = (
            Venta.objects.select_related("cliente", "descuento", "corregida_por")
            .prefetch_related("items", "reembolsos__items")
            .all()
        )
        estado = request.query_params.get("estado")
        if estado:
            ventas = ventas.filter(estado=estado)
        serializer = VentaSerializer(ventas, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        try:
            pk = str(request.data.get("id") or "").strip()
            venta_existente = Venta.objects.filter(pk=pk).first() if pk else None
            if venta_existente and venta_existente.estado == Venta.ESTADO_CERRADA:
                return Response(
                    {"message": f"Ya existe una venta cerrada con id {pk}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            venta = guardar_o_cerrar_venta(
                request.data,
                usuario=request.user,
                venta_existente=venta_existente,
            )
            return Response(
                VentaSerializer(venta).data,
                status=status.HTTP_201_CREATED,
            )
        except ValidationError as exc:
            return Response(
                {"message": formatear_error_serializer(exc.detail)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class VentaDetailView(APIView):
    permission_classes = [EsAdminOCajero]

    def get_object(self, pk):
        return get_object_or_404(
            Venta.objects.select_related("cliente", "descuento", "corregida_por").prefetch_related(
                "items", "reembolsos__items"
            ),
            pk=pk,
        )

    def get(self, request, pk):
        venta = self.get_object(pk)
        return Response(VentaSerializer(venta).data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self._actualizar(request, pk)

    def patch(self, request, pk):
        return self._actualizar(request, pk)

    def _actualizar(self, request, pk):
        venta = self.get_object(pk)
        try:
            if venta.estado == Venta.ESTADO_CERRADA:
                # Requisito 3.8: El cajero NO puede corregir ventas cerradas
                if not es_admin(request.user):
                    return Response(
                        {"message": "Acceso denegado: solo el Administrador puede corregir ventas cerradas."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                actualizada = corregir_venta_cerrada(
                    venta, request.data, usuario=request.user
                )
            else:
                actualizada = guardar_o_cerrar_venta(
                    request.data,
                    usuario=request.user,
                    venta_existente=venta,
                )
            return Response(
                VentaSerializer(actualizada).data,
                status=status.HTTP_200_OK,
            )
        except ValidationError as exc:
            return Response(
                {"message": formatear_error_serializer(exc.detail)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class VentaCorregirView(APIView):
    permission_classes = [EsAdministrador]

    def post(self, request, pk):
        venta = get_object_or_404(Venta, pk=pk)
        try:
            corregida = corregir_venta_cerrada(
                venta, request.data, usuario=request.user
            )
            return Response(
                VentaSerializer(corregida).data,
                status=status.HTTP_200_OK,
            )
        except ValidationError as exc:
            return Response(
                {"message": formatear_error_serializer(exc.detail)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class VentaReembolsoView(APIView):
    permission_classes = [EsAdminOCajero]

    def get(self, request, pk):
        venta = get_object_or_404(Venta, pk=pk)
        reembolsos = venta.reembolsos.prefetch_related("items").all()
        return Response(
            ReembolsoSerializer(reembolsos, many=True).data,
            status=status.HTTP_200_OK,
        )

    def post(self, request, pk):
        # Requisito 3.8: El cajero NO puede realizar reembolsos
        if not es_admin(request.user):
            return Response(
                {"message": "Acceso denegado: solo el Administrador puede realizar reembolsos."},
                status=status.HTTP_403_FORBIDDEN,
            )
        venta = get_object_or_404(Venta, pk=pk)
        try:
            reembolso = registrar_reembolso_venta(
                venta, request.data, usuario=request.user
            )
            return Response(
                ReembolsoSerializer(reembolso).data,
                status=status.HTTP_201_CREATED,
            )
        except ValidationError as exc:
            return Response(
                {"message": formatear_error_serializer(exc.detail)},
                status=status.HTTP_400_BAD_REQUEST,
            )


# =====================================================================
# COMPRAS (Solo Administrador - Requisito 3.8)
# =====================================================================

class CompraListCreateView(APIView):
    permission_classes = [EsAdministrador]

    def get(self, request):
        compras = (
            Compra.objects.select_related("proveedor")
            .prefetch_related("items")
            .all()
        )
        return Response(
            CompraSerializer(compras, many=True).data,
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        try:
            compra = registrar_compra_servicio(
                request.data, usuario=request.user
            )
            return Response(
                CompraSerializer(compra).data,
                status=status.HTTP_201_CREATED,
            )
        except ValidationError as exc:
            return Response(
                {"message": formatear_error_serializer(exc.detail)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class CompraDetailView(APIView):
    permission_classes = [EsAdministrador]

    def get(self, request, pk):
        compra = get_object_or_404(
            Compra.objects.select_related("proveedor").prefetch_related("items"),
            pk=pk,
        )
        return Response(CompraSerializer(compra).data, status=status.HTTP_200_OK)


# =====================================================================
# FALTANTES (Administrador y Cajero - Requisito 3.7 y 3.8)
# =====================================================================

class FaltanteListCreateView(APIView):
    permission_classes = [EsAdminOCajero]

    def get(self, request):
        qs = Faltante.objects.select_related("producto", "proveedor").all()
        tipo = request.query_params.get("tipo")
        proveedor_id = request.query_params.get("proveedorId") or request.query_params.get("proveedor")
        estado = request.query_params.get("estado")

        if tipo:
            qs = qs.filter(tipo=tipo)
        if proveedor_id:
            qs = qs.filter(proveedor_id=proveedor_id)
        if estado:
            qs = qs.filter(estado=estado)

        return Response(
            FaltanteSerializer(qs, many=True).data,
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        datos = request.data.copy() if isinstance(request.data, dict) else {}
        if not datos.get("proveedorId"):
            datos["proveedorId"] = None
        if not datos.get("productoId"):
            datos["productoId"] = None

        serializer = FaltanteSerializer(data=datos)
        if serializer.is_valid():
            usuario = request.user if request.user.is_authenticated else None
            faltante = serializer.save(registrado_por=usuario)
            return Response(
                FaltanteSerializer(faltante).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(
            {
                "message": formatear_error_serializer(serializer.errors),
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )


class FaltanteDetailView(APIView):
    permission_classes = [EsAdminOCajero]

    def patch(self, request, pk):
        return self._actualizar(request, pk)

    def put(self, request, pk):
        return self._actualizar(request, pk)

    def _actualizar(self, request, pk):
        faltante = get_object_or_404(Faltante, pk=pk)
        nuevo_estado = request.data.get("estado")
        if nuevo_estado in (Faltante.ESTADO_PENDIENTE, Faltante.ESTADO_RESUELTO):
            faltante.estado = nuevo_estado
            faltante.save(update_fields=["estado"])
            return Response(
                FaltanteSerializer(faltante).data,
                status=status.HTTP_200_OK,
            )
        serializer = FaltanteSerializer(faltante, data=request.data, partial=True)
        if serializer.is_valid():
            actualizado = serializer.save()
            return Response(
                FaltanteSerializer(actualizado).data,
                status=status.HTTP_200_OK,
            )
        return Response(
            {"message": formatear_error_serializer(serializer.errors)},
            status=status.HTTP_400_BAD_REQUEST,
        )


class FaltantesAgrupadosView(APIView):
    permission_classes = [EsAdminOCajero]

    def get(self, request):
        qs = Faltante.objects.filter(estado=Faltante.ESTADO_PENDIENTE).select_related(
            "producto", "proveedor"
        )
        tipo = request.query_params.get("tipo")
        proveedor_id = request.query_params.get("proveedorId") or request.query_params.get("proveedor")
        if tipo:
            qs = qs.filter(tipo=tipo)
        if proveedor_id:
            qs = qs.filter(proveedor_id=proveedor_id)

        grupos = {}
        for f in qs:
            clave = (f.nombre_normalizado, f.proveedor_id or "", f.tipo)
            if clave not in grupos:
                grupos[clave] = {
                    "nombreNormalizado": f.nombre_normalizado,
                    "descripcionReferencia": f.producto.nombre if f.producto else f.descripcion,
                    "productoId": f.producto_id or "",
                    "tipo": f.tipo,
                    "proveedorId": f.proveedor_id or "",
                    "proveedorNombre": f.proveedor.nombre if f.proveedor else "Sin proveedor",
                    "cantidadTotalSolicitada": 0,
                    "numeroSolicitudes": 0,
                    "idsFaltantes": [],
                }
            grupos[clave]["cantidadTotalSolicitada"] += f.cantidad_solicitada
            grupos[clave]["numeroSolicitudes"] += 1
            grupos[clave]["idsFaltantes"].append(f.id)

        resultado = sorted(
            grupos.values(),
            key=lambda x: (-x["cantidadTotalSolicitada"], x["nombreNormalizado"]),
        )
        return Response(resultado, status=status.HTTP_200_OK)


# =====================================================================
# REPORTES ADMINISTRATIVOS (Solo Administrador - Requisito 3.8 y 3.10)
# =====================================================================

class ReportesResumenView(APIView):
    permission_classes = [EsAdministrador]

    def get(self, request):
        try:
            f_ini, f_fin, dt_inicio, dt_fin = parsear_rango_fechas(
                request.query_params.get("fechaInicio"),
                request.query_params.get("fechaFin"),
            )
        except ValidationError as exc:
            return Response(
                {"message": formatear_error_serializer(exc.detail)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ventas_qs = Venta.objects.filter(
            estado=Venta.ESTADO_CERRADA,
            fecha__range=(dt_inicio, dt_fin),
        )
        total_ventas_bruto = ventas_qs.aggregate(s=Sum("total"))["s"] or 0
        total_reembolsos = (
            Reembolso.objects.filter(venta__in=ventas_qs).aggregate(
                s=Sum("total_reembolsado")
            )["s"]
            or 0
        )

        mas_vendidos_qs = (
            DetalleVenta.objects.filter(
                venta__estado=Venta.ESTADO_CERRADA,
                venta__fecha__range=(dt_inicio, dt_fin),
            )
            .values("producto_id", "nombre_historico")
            .annotate(
                unidadesVendidas=Sum("cantidad"),
                ingresosLinea=Sum("subtotal_linea"),
            )
            .order_by("-unidadesVendidas", "-ingresosLinea")
        )

        compras_qs = (
            Compra.objects.filter(fecha__range=(dt_inicio, dt_fin))
            .select_related("proveedor")
            .prefetch_related("items")
        )
        total_compras_monto = compras_qs.aggregate(s=Sum("total"))["s"] or 0

        faltantes_frecuentes = (
            Faltante.objects.values("nombre_normalizado", "tipo")
            .annotate(
                vecesReportado=Count("id"),
                unidadesSolicitadas=Sum("cantidad_solicitada"),
            )
            .order_by("-vecesReportado", "-unidadesSolicitadas")
        )

        return Response(
            {
                "rango": {
                    "fechaInicio": str(f_ini),
                    "fechaFin": str(f_fin),
                },
                "ventasTotales": {
                    "cantidadVentas": ventas_qs.count(),
                    "totalFacturado": total_ventas_bruto,
                    "totalReembolsado": total_reembolsos,
                    "ventasNetas": max(0, total_ventas_bruto - total_reembolsos),
                },
                "productosMasVendidos": list(mas_vendidos_qs),
                "comprasRegistradas": {
                    "cantidadCompras": compras_qs.count(),
                    "montoTotalCompras": total_compras_monto,
                    "listado": CompraSerializer(compras_qs, many=True).data,
                },
                "faltantesFrecuentes": list(faltantes_frecuentes),
            },
            status=status.HTTP_200_OK,
        )