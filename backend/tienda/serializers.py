from rest_framework import serializers
from .models import (
    Categoria,
    Proveedor,
    Cliente,
    Producto,
    Descuento,
    Venta,
    DetalleVenta,
    Compra,
    DetalleCompra,
    Reembolso,
    DetalleReembolso,
    Faltante,
)
from .services import normalizar_nombre_faltante


class CategoriaSerializer(serializers.ModelSerializer):
    id = serializers.CharField(required=False, allow_blank=False, max_length=64)

    class Meta:
        model = Categoria
        fields = ["id", "nombre"]

    def validate_nombre(self, value):
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError("El nombre de la categoría es obligatorio.")
        qs = Categoria.objects.filter(nombre__iexact=nombre)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe una categoría con ese nombre.")
        return nombre


class ProveedorSerializer(serializers.ModelSerializer):
    id = serializers.CharField(required=False, allow_blank=False, max_length=64)

    class Meta:
        model = Proveedor
        fields = ["id", "nombre", "telefono", "correo"]

    def validate_nombre(self, value):
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError("El nombre del proveedor es obligatorio.")
        return nombre


class ClienteSerializer(serializers.ModelSerializer):
    id = serializers.CharField(required=False, allow_blank=False, max_length=64)

    class Meta:
        model = Cliente
        fields = ["id", "nombre", "telefono", "correo"]

    def validate_nombre(self, value):
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError("El nombre del cliente es obligatorio.")
        return nombre


class ProductoSerializer(serializers.ModelSerializer):
    id = serializers.CharField(required=False, allow_blank=False, max_length=64)
    categoriaId = serializers.PrimaryKeyRelatedField(
        source="categoria",
        queryset=Categoria.objects.all(),
        error_messages={
            "does_not_exist": "La categoría seleccionada no existe.",
            "required": "La categoría es obligatoria.",
            "null": "La categoría es obligatoria.",
        },
    )
    seguimientoInventario = serializers.BooleanField(
        source="seguimiento_inventario",
        required=False,
        default=True,
    )
    categoriaNombre = serializers.CharField(source="categoria.nombre", read_only=True)

    class Meta:
        model = Producto
        fields = [
            "id",
            "codigo",
            "nombre",
            "categoriaId",
            "categoriaNombre",
            "precio",
            "costo",
            "seguimientoInventario",
            "stock",
            "descripcion",
            "imagenes",
        ]

    def validate_nombre(self, value):
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError("El nombre del producto es obligatorio.")
        return nombre

    def validate_precio(self, value):
        if value < 0:
            raise serializers.ValidationError("El precio no puede ser negativo.")
        return value

    def validate_costo(self, value):
        if value < 0:
            raise serializers.ValidationError("El costo no puede ser negativo.")
        return value

    def validate(self, attrs):
        seguimiento = attrs.get(
            "seguimiento_inventario",
            self.instance.seguimiento_inventario if self.instance else True,
        )
        stock = attrs.get(
            "stock",
            self.instance.stock if self.instance else 0,
        )
        if seguimiento and stock < 0:
            raise serializers.ValidationError(
                {"stock": "El stock no puede ser negativo."}
            )
        if not seguimiento and "seguimiento_inventario" in attrs:
            attrs["stock"] = 0
        return attrs


class DescuentoSerializer(serializers.ModelSerializer):
    id = serializers.CharField(required=False, allow_blank=False, max_length=64)

    class Meta:
        model = Descuento
        fields = ["id", "nombre", "tipo", "valor"]

    def validate_nombre(self, value):
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError("El nombre del descuento es obligatorio.")
        qs = Descuento.objects.filter(nombre__iexact=nombre)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un descuento con ese nombre.")
        return nombre

    def validate(self, attrs):
        tipo = attrs.get("tipo", self.instance.tipo if self.instance else "")
        valor = attrs.get("valor", self.instance.valor if self.instance else 0)
        if valor <= 0:
            raise serializers.ValidationError(
                {"valor": "El valor del descuento debe ser mayor a 0."}
            )
        if tipo == Descuento.TIPO_PORCENTAJE and valor > 100:
            raise serializers.ValidationError(
                {"valor": "Un descuento porcentual no puede superar el 100%."}
            )
        return attrs


class DetalleVentaSerializer(serializers.ModelSerializer):
    productoId = serializers.CharField(source="producto_id", read_only=True)
    nombre = serializers.CharField(source="nombre_historico", read_only=True)
    precio = serializers.IntegerField(source="precio_unitario", read_only=True)
    costo = serializers.IntegerField(source="costo_unitario", read_only=True)
    subtotalLinea = serializers.IntegerField(source="subtotal_linea", read_only=True)

    class Meta:
        model = DetalleVenta
        fields = ["id", "productoId", "nombre", "precio", "costo", "cantidad", "subtotalLinea"]


class DetalleReembolsoSerializer(serializers.ModelSerializer):
    productoId = serializers.CharField(source="producto_id", read_only=True)
    nombre = serializers.CharField(source="nombre_historico", read_only=True)
    retornaInventario = serializers.BooleanField(source="retorna_inventario", read_only=True)
    montoReembolsado = serializers.IntegerField(source="monto_reembolsado", read_only=True)

    class Meta:
        model = DetalleReembolso
        fields = ["id", "productoId", "nombre", "cantidad", "retornaInventario", "montoReembolsado"]


class ReembolsoSerializer(serializers.ModelSerializer):
    ventaId = serializers.CharField(source="venta_id", read_only=True)
    usuarioNombre = serializers.SerializerMethodField()
    totalReembolsado = serializers.IntegerField(source="total_reembolsado", read_only=True)
    items = DetalleReembolsoSerializer(many=True, read_only=True)

    class Meta:
        model = Reembolso
        fields = ["id", "ventaId", "fecha", "usuarioNombre", "totalReembolsado", "items"]

    def get_usuarioNombre(self, obj):
        if obj.usuario:
            return obj.usuario.first_name or obj.usuario.username
        return "Administrador"


class VentaSerializer(serializers.ModelSerializer):
    clienteId = serializers.SerializerMethodField()
    metodoPago = serializers.CharField(source="metodo_pago", read_only=True)
    valorRecibido = serializers.IntegerField(source="valor_recibido", read_only=True)
    actualizadoEn = serializers.DateTimeField(source="actualizado_en", read_only=True)
    descuentoId = serializers.SerializerMethodField()
    descuentoNombre = serializers.CharField(source="descuento_nombre_historico", read_only=True)
    descuentoTipo = serializers.CharField(source="descuento_tipo_historico", read_only=True)
    descuentoValor = serializers.IntegerField(source="descuento_valor_historico", read_only=True)
    montoDescuento = serializers.IntegerField(source="monto_descuento", read_only=True)
    corregidaPor = serializers.SerializerMethodField()
    fechaCorreccion = serializers.DateTimeField(source="fecha_correccion", read_only=True)
    tieneReembolsos = serializers.SerializerMethodField()
    totalReembolsado = serializers.SerializerMethodField()
    reembolsos = ReembolsoSerializer(many=True, read_only=True)
    items = DetalleVentaSerializer(many=True, read_only=True)
    itemsJson = DetalleVentaSerializer(source="items", many=True, read_only=True)

    class Meta:
        model = Venta
        fields = [
            "id",
            "fecha",
            "actualizadoEn",
            "estado",
            "clienteId",
            "metodoPago",
            "subtotal",
            "iva",
            "descuentoId",
            "descuentoNombre",
            "descuentoTipo",
            "descuentoValor",
            "montoDescuento",
            "total",
            "valorRecibido",
            "cambio",
            "corregida",
            "fechaCorreccion",
            "corregidaPor",
            "tieneReembolsos",
            "totalReembolsado",
            "reembolsos",
            "items",
            "itemsJson",
        ]

    def get_clienteId(self, obj):
        return obj.cliente_id or ""

    def get_descuentoId(self, obj):
        return obj.descuento_id or ""

    def get_corregidaPor(self, obj):
        if obj.corregida_por:
            return obj.corregida_por.first_name or obj.corregida_por.username
        return ""

    def get_tieneReembolsos(self, obj):
        return obj.reembolsos.exists()

    def get_totalReembolsado(self, obj):
        return sum(r.total_reembolsado for r in obj.reembolsos.all())


class DetalleCompraSerializer(serializers.ModelSerializer):
    productoId = serializers.CharField(source="producto_id", read_only=True)
    nombre = serializers.CharField(source="nombre_historico", read_only=True)
    costo = serializers.IntegerField(source="costo_unitario", read_only=True)
    subtotalLinea = serializers.IntegerField(source="subtotal_linea", read_only=True)

    class Meta:
        model = DetalleCompra
        fields = ["id", "productoId", "nombre", "costo", "cantidad", "subtotalLinea"]


class CompraSerializer(serializers.ModelSerializer):
    proveedorId = serializers.CharField(source="proveedor_id", read_only=True)
    proveedorNombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    items = DetalleCompraSerializer(many=True, read_only=True)
    itemsJson = DetalleCompraSerializer(source="items", many=True, read_only=True)

    class Meta:
        model = Compra
        fields = ["id", "fecha", "proveedorId", "proveedorNombre", "total", "items", "itemsJson"]


class FaltanteSerializer(serializers.ModelSerializer):
    id = serializers.CharField(required=False, allow_blank=False, max_length=64)
    productoId = serializers.PrimaryKeyRelatedField(
        source="producto",
        queryset=Producto.objects.all(),
        required=False,
        allow_null=True,
    )
    proveedorId = serializers.PrimaryKeyRelatedField(
        source="proveedor",
        queryset=Proveedor.objects.all(),
        required=False,
        allow_null=True,
    )
    cantidadSolicitada = serializers.IntegerField(source="cantidad_solicitada", min_value=1)
    nombreNormalizado = serializers.CharField(source="nombre_normalizado", read_only=True)
    productoNombre = serializers.SerializerMethodField()
    proveedorNombre = serializers.SerializerMethodField()

    class Meta:
        model = Faltante
        fields = [
            "id",
            "productoId",
            "productoNombre",
            "descripcion",
            "nombreNormalizado",
            "cantidadSolicitada",
            "fecha",
            "tipo",
            "proveedorId",
            "proveedorNombre",
            "estado",
        ]
        read_only_fields = ["fecha", "nombreNormalizado"]

    def get_productoNombre(self, obj):
        return obj.producto.nombre if obj.producto else obj.descripcion

    def get_proveedorNombre(self, obj):
        return obj.proveedor.nombre if obj.proveedor else "Sin proveedor"

    def validate(self, attrs):
        producto = attrs.get("producto", self.instance.producto if self.instance else None)
        descripcion = str(
            attrs.get("descripcion", self.instance.descripcion if self.instance else "")
        ).strip()

        if producto and not descripcion:
            descripcion = producto.nombre

        if not descripcion:
            raise serializers.ValidationError(
                {"descripcion": "Debes indicar un producto existente o escribir una descripción."}
            )

        attrs["descripcion"] = descripcion
        attrs["nombre_normalizado"] = normalizar_nombre_faltante(descripcion)
        return attrs