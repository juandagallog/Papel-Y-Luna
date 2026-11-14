import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


def generar_id():
    return str(uuid.uuid4())


class PerfilUsuario(models.Model):
    ROL_ADMIN = "ADMIN"
    ROL_CAJERO = "CAJERO"
    ROLES = [
        (ROL_ADMIN, "Administrador"),
        (ROL_CAJERO, "Cajero"),
    ]

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="perfil",
    )
    rol = models.CharField(max_length=20, choices=ROLES, default=ROL_CAJERO)

    def __str__(self):
        return f"{self.usuario.username} ({self.rol})"


class Categoria(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    nombre = models.CharField(max_length=120, unique=True)

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Proveedor(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    nombre = models.CharField(max_length=150)
    telefono = models.CharField(max_length=50, blank=True, default="")
    correo = models.CharField(max_length=150, blank=True, default="")

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Cliente(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    nombre = models.CharField(max_length=150)
    documento = models.CharField(max_length=50, blank=True, default="")
    telefono = models.CharField(max_length=50, blank=True, default="")
    correo = models.CharField(max_length=150, blank=True, default="")
    direccion = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Producto(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    codigo = models.CharField(max_length=50)
    nombre = models.CharField(max_length=150)
    categoria = models.ForeignKey(
        Categoria,
        on_delete=models.PROTECT,
        related_name="productos",
    )
    precio = models.BigIntegerField(default=0)
    costo = models.BigIntegerField(default=0)
    seguimiento_inventario = models.BooleanField(default=True)
    stock = models.IntegerField(default=0)
    descripcion = models.TextField(blank=True, default="")
    imagenes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["codigo", "nombre"]

    def __str__(self):
        return f"{self.codigo} - {self.nombre}"


class Descuento(models.Model):
    TIPO_PORCENTAJE = "porcentaje"
    TIPO_FIJO = "fijo"
    TIPOS = [
        (TIPO_PORCENTAJE, "Porcentaje"),
        (TIPO_FIJO, "Valor fijo"),
    ]

    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    nombre = models.CharField(max_length=120, unique=True)
    tipo = models.CharField(max_length=20, choices=TIPOS)
    valor = models.BigIntegerField()

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return f"{self.nombre} ({self.tipo}: {self.valor})"


class Venta(models.Model):
    ESTADO_ABIERTA = "abierta"
    ESTADO_CERRADA = "cerrada"
    ESTADOS = [
        (ESTADO_ABIERTA, "Abierta"),
        (ESTADO_CERRADA, "Cerrada"),
    ]

    PAGO_EFECTIVO = "Efectivo"
    PAGO_NEQUI = "Nequi"
    PAGO_DEBE = "Debe"
    METODOS_PAGO = [
        (PAGO_EFECTIVO, "Efectivo"),
        (PAGO_NEQUI, "Nequi"),
        (PAGO_DEBE, "Debe"),
    ]

    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    fecha = models.DateTimeField(default=timezone.now)
    actualizado_en = models.DateTimeField(default=timezone.now)
    estado = models.CharField(max_length=20, choices=ESTADOS, default=ESTADO_CERRADA)
    cliente = models.ForeignKey(
        Cliente,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ventas",
    )
    metodo_pago = models.CharField(max_length=20, choices=METODOS_PAGO, default=PAGO_EFECTIVO)
    subtotal = models.BigIntegerField(default=0)
    iva = models.BigIntegerField(default=0)

    # Descuento aplicado y datos históricos congelados (Requisito 3.6)
    descuento = models.ForeignKey(
        Descuento,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ventas",
    )
    descuento_nombre_historico = models.CharField(max_length=120, blank=True, default="")
    descuento_tipo_historico = models.CharField(max_length=20, blank=True, default="")
    descuento_valor_historico = models.BigIntegerField(default=0)
    monto_descuento = models.BigIntegerField(default=0)

    total = models.BigIntegerField(default=0)
    valor_recibido = models.BigIntegerField(default=0)
    cambio = models.BigIntegerField(default=0)

    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ventas_creadas",
    )

    # Campos de corrección de ventas cerradas (Requisito 3.4)
    corregida = models.BooleanField(default=False)
    fecha_correccion = models.DateTimeField(null=True, blank=True)
    corregida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="ventas_corregidas",
    )

    class Meta:
        ordering = ["-fecha"]

    def __str__(self):
        return f"Venta {self.id} ({self.estado})"


class DetalleVenta(models.Model):
    venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        related_name="items",
    )
    producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        related_name="detalles_venta",
    )
    nombre_historico = models.CharField(max_length=150)
    precio_unitario = models.BigIntegerField()
    costo_unitario = models.BigIntegerField(default=0)
    cantidad = models.PositiveIntegerField()
    subtotal_linea = models.BigIntegerField()

    def __str__(self):
        return f"{self.nombre_historico} x{self.cantidad} (Venta {self.venta_id})"


class Compra(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    fecha = models.DateTimeField(default=timezone.now)
    proveedor = models.ForeignKey(
        Proveedor,
        on_delete=models.PROTECT,
        related_name="compras",
    )
    total = models.BigIntegerField(default=0)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="compras_registradas",
    )

    class Meta:
        ordering = ["-fecha"]

    def __str__(self):
        return f"Compra {self.id} - {self.proveedor.nombre}"


class DetalleCompra(models.Model):
    compra = models.ForeignKey(
        Compra,
        on_delete=models.CASCADE,
        related_name="items",
    )
    producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        related_name="detalles_compra",
    )
    nombre_historico = models.CharField(max_length=150)
    costo_unitario = models.BigIntegerField()
    cantidad = models.PositiveIntegerField()
    subtotal_linea = models.BigIntegerField()

    def __str__(self):
        return f"{self.nombre_historico} x{self.cantidad} (Compra {self.compra_id})"


class Reembolso(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        related_name="reembolsos",
    )
    fecha = models.DateTimeField(default=timezone.now)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reembolsos_registrados",
    )
    total_reembolsado = models.BigIntegerField(default=0)

    class Meta:
        ordering = ["-fecha"]

    def __str__(self):
        return f"Reembolso {self.id} (Venta {self.venta_id})"


class DetalleReembolso(models.Model):
    reembolso = models.ForeignKey(
        Reembolso,
        on_delete=models.CASCADE,
        related_name="items",
    )
    detalle_venta = models.ForeignKey(
        DetalleVenta,
        on_delete=models.PROTECT,
        related_name="reembolsos_linea",
    )
    producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        related_name="detalles_reembolso",
    )
    nombre_historico = models.CharField(max_length=150)
    cantidad = models.PositiveIntegerField()
    retorna_inventario = models.BooleanField(default=True)
    monto_reembolsado = models.BigIntegerField(default=0)

    def __str__(self):
        return f"Reembolso {self.nombre_historico} x{self.cantidad}"


class Faltante(models.Model):
    TIPO_INEXISTENTE = "inexistente"
    TIPO_AGOTADO = "agotado"
    TIPOS = [
        (TIPO_INEXISTENTE, "Inexistente"),
        (TIPO_AGOTADO, "Agotado"),
    ]

    ESTADO_PENDIENTE = "pendiente"
    ESTADO_RESUELTO = "resuelto"
    ESTADOS = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_RESUELTO, "Resuelto"),
    ]

    id = models.CharField(max_length=64, primary_key=True, default=generar_id)
    producto = models.ForeignKey(
        Producto,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="faltantes",
    )
    descripcion = models.CharField(max_length=150)
    nombre_normalizado = models.CharField(max_length=150, db_index=True)
    cantidad_solicitada = models.PositiveIntegerField(default=1)
    fecha = models.DateTimeField(default=timezone.now)
    tipo = models.CharField(max_length=20, choices=TIPOS)
    proveedor = models.ForeignKey(
        Proveedor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="faltantes",
    )
    estado = models.CharField(max_length=20, choices=ESTADOS, default=ESTADO_PENDIENTE)
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="faltantes_registrados",
    )

    class Meta:
        ordering = ["-fecha"]

    def __str__(self):
        return f"Faltante: {self.descripcion} ({self.estado})"