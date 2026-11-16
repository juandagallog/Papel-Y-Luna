import re
import unicodedata
from datetime import datetime, time
from django.db import transaction
from django.db.models import Sum, F
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied
from .permissions import es_admin

from .models import (
    Producto,
    Cliente,
    Proveedor,
    Descuento,
    Venta,
    DetalleVenta,
    Compra,
    DetalleCompra,
    Reembolso,
    DetalleReembolso,
    Faltante,
)


def error_negocio(mensaje):
    raise ValidationError({"message": mensaje})


# =====================================================================
# 1. NORMALIZACIÓN DE FALTANTES (Requisito 3.7: minúsculas, sin tildes, plural simple)
# =====================================================================

def normalizar_palabra_singular(palabra):
    if len(palabra) <= 3:
        return palabra
    # Plurales en -ces -> -z (ej. lapices -> lapiz)
    if palabra.endswith("ces") and len(palabra) > 4:
        return palabra[:-3] + "z"
    # Plurales en -es cuando termina en consonante (ej. borradores -> borrador, marcadores -> marcador)
    if palabra.endswith("es") and len(palabra) > 4 and palabra[-3] in "rlndjzs":
        return palabra[:-2]
    # Plural simple en -s (ej. cuadernos -> cuaderno, carpetas -> carpeta)
    if palabra.endswith("s") and not palabra.endswith("ss"):
        return palabra[:-1]
    return palabra


def normalizar_nombre_faltante(texto):
    if not texto:
        return ""
    # 1. Minúsculas y limpieza de espacios
    limpio = str(texto).strip().lower()
    # 2. Quitar tildes/diacríticos conservando letras base
    limpio = "".join(
        c for c in unicodedata.normalize("NFD", limpio)
        if unicodedata.category(c) != "Mn"
    )
    # 3. Dejar solo caracteres alfanuméricos y espacios
    limpio = re.sub(r"[^a-z0-9\s]", " ", limpio)
    palabras = [normalizar_palabra_singular(p) for p in limpio.split() if p]
    return " ".join(palabras)


# =====================================================================
# 2. CÁLCULO CENTRALIZADO DE IMPORTES Y DESCUENTOS (Requisitos 3.6 y 5.3)
# =====================================================================

def calcular_montos_venta(subtotal, tipo_descuento="", valor_descuento=0):
    subtotal = int(round(subtotal))
    # Redondeo a pesos como Math.round del POS, sin errores de coma flotante.
    iva = (subtotal * 19 + 50) // 100
    total_bruto = subtotal + iva

    monto_descuento = 0
    if tipo_descuento == Descuento.TIPO_PORCENTAJE and valor_descuento > 0:
        monto_descuento = (total_bruto * valor_descuento + 50) // 100
    elif tipo_descuento == Descuento.TIPO_FIJO and valor_descuento > 0:
        monto_descuento = int(valor_descuento)

    # El descuento nunca puede superar el total bruto (el total nunca puede ser negativo)
    if monto_descuento > total_bruto:
        monto_descuento = total_bruto

    total_final = max(0, total_bruto - monto_descuento)
    return subtotal, iva, monto_descuento, total_final


def extraer_items_payload(datos):
    items = datos.get("items")
    if items is None:
        items = datos.get("itemsJson")
    if not isinstance(items, list) or len(items) == 0:
        error_negocio("Debes incluir al menos un producto en la operación.")
    return items


def resolver_descuento(datos, usuario, venta_existente=None):
    """Resuelve catálogo o descuento puntual sin crear filas de catálogo."""
    descuento_id = datos.get("descuentoId") or datos.get("descuento_id") or ""
    puntual = datos.get("descuentoPersonalizado")
    if puntual is not None:
        if (isinstance(puntual, dict) and venta_existente and not venta_existente.descuento_id
                and puntual.get("tipo") == venta_existente.descuento_tipo_historico
                and puntual.get("valor") == venta_existente.descuento_valor_historico
                and not descuento_id):
            return (None, venta_existente.descuento_nombre_historico,
                    venta_existente.descuento_tipo_historico, venta_existente.descuento_valor_historico)
        if not es_admin(usuario):
            raise PermissionDenied("Solo el administrador puede definir un descuento puntual.")
        if descuento_id:
            error_negocio("Solo puede aplicarse un descuento por venta.")
        if not isinstance(puntual, dict):
            error_negocio("El descuento puntual debe indicar tipo y valor.")
        tipo, valor = puntual.get("tipo"), puntual.get("valor")
        if tipo not in (Descuento.TIPO_FIJO, Descuento.TIPO_PORCENTAJE):
            error_negocio("Tipo de descuento puntual inválido.")
        if isinstance(valor, bool) or not isinstance(valor, int) or not 0 < valor <= 9007199254740991:
            error_negocio("El descuento debe ser un entero positivo representable con precisión en el navegador.")
        if tipo == Descuento.TIPO_PORCENTAJE and valor > 100:
            error_negocio("El porcentaje no puede superar el 100%.")
        return None, "Descuento puntual", tipo, valor
    if descuento_id:
        descuento = Descuento.objects.filter(pk=str(descuento_id)).first()
        if not descuento:
            error_negocio("El descuento seleccionado no existe.")
        if venta_existente and str(venta_existente.descuento_id) == str(descuento_id):
            return (descuento, venta_existente.descuento_nombre_historico,
                    venta_existente.descuento_tipo_historico, venta_existente.descuento_valor_historico)
        if not descuento.disponible:
            error_negocio("El descuento seleccionado no está disponible para nuevas ventas.")
        return descuento, descuento.nombre, descuento.tipo, descuento.valor
    return None, "", "", 0


# =====================================================================
# 3. VENTAS Y VENTAS ABIERTAS (Requisitos 3.1, 3.6, 3.9)
# =====================================================================

@transaction.atomic
def guardar_o_cerrar_venta(datos, usuario=None, venta_existente=None):
    estado_nuevo = str(datos.get("estado", Venta.ESTADO_CERRADA)).lower().strip()
    if estado_nuevo not in (Venta.ESTADO_ABIERTA, Venta.ESTADO_CERRADA):
        error_negocio("El estado de la venta debe ser 'abierta' o 'cerrada'.")

    if venta_existente and venta_existente.estado == Venta.ESTADO_CERRADA:
        error_negocio(
            "Esta venta ya está cerrada. Para modificarla utiliza la operación de corrección."
        )

    metodo_pago = datos.get("metodoPago") or datos.get("metodo_pago") or Venta.PAGO_EFECTIVO
    if metodo_pago not in (Venta.PAGO_EFECTIVO, Venta.PAGO_NEQUI, Venta.PAGO_DEBE):
        error_negocio("Método de pago no válido.")

    cliente_id = datos.get("clienteId") or datos.get("cliente_id") or ""
    cliente = None
    if cliente_id:
        cliente = Cliente.objects.filter(pk=str(cliente_id)).first()
        if not cliente:
            error_negocio("El cliente seleccionado no existe.")

    # Regla 3.1: Exigir cliente para ventas con método de pago Debe
    if metodo_pago == Venta.PAGO_DEBE and not cliente:
        error_negocio("Debes seleccionar un cliente para una venta con método Debe.")

    # Descuento (máximo 1 por venta)
    descuento_obj, desc_nombre, desc_tipo, desc_valor = resolver_descuento(datos, usuario, venta_existente)

    items_raw = extraer_items_payload(datos)

    # Agrupar cantidades por producto y bloquear filas en BD
    cantidades_por_producto = {}
    orden_lineas = []
    for linea in items_raw:
        prod_id = str(linea.get("productoId") or linea.get("id") or "").strip()
        try:
            cantidad = int(linea.get("cantidad", 0))
        except (TypeError, ValueError):
            cantidad = 0
        if not prod_id or cantidad <= 0:
            error_negocio("Producto o cantidad no válidos en la venta.")
        if prod_id not in cantidades_por_producto:
            cantidades_por_producto[prod_id] = 0
            orden_lineas.append(prod_id)
        cantidades_por_producto[prod_id] += cantidad

    productos_map = {
        p.id: p
        for p in Producto.objects.select_for_update().filter(
            id__in=list(cantidades_por_producto.keys())
        )
    }

    if len(productos_map) != len(cantidades_por_producto):
        error_negocio("Uno o más productos de la factura no existen en la base de datos.")

    subtotal_acumulado = 0
    lineas_preparadas = []

    for prod_id in orden_lineas:
        producto = productos_map[prod_id]
        cantidad = cantidades_por_producto[prod_id]

        # Validar stock si la venta se va a CERRAR
        if estado_nuevo == Venta.ESTADO_CERRADA and producto.seguimiento_inventario:
            if cantidad > producto.stock:
                error_negocio(
                    f"Stock insuficiente para '{producto.nombre}'. Disponible: {producto.stock}."
                )

        # El servidor usa siempre el precio oficial del producto en catálogo
        precio_unitario = int(producto.precio)
        costo_unitario = int(producto.costo)
        subtotal_linea = precio_unitario * cantidad
        subtotal_acumulado += subtotal_linea

        lineas_preparadas.append(
            {
                "producto": producto,
                "nombre_historico": producto.nombre,
                "precio_unitario": precio_unitario,
                "costo_unitario": costo_unitario,
                "cantidad": cantidad,
                "subtotal_linea": subtotal_linea,
            }
        )

    subtotal, iva, monto_descuento, total = calcular_montos_venta(
        subtotal_acumulado, desc_tipo, desc_valor
    )

    valor_recibido_raw = datos.get("valorRecibido", datos.get("valor_recibido", 0))
    try:
        valor_recibido = int(round(float(valor_recibido_raw or 0)))
    except (TypeError, ValueError):
        valor_recibido = 0

    if valor_recibido < 0:
        error_negocio("El valor recibido no puede ser negativo.")

    cambio = 0
    if estado_nuevo == Venta.ESTADO_CERRADA:
        if metodo_pago == Venta.PAGO_EFECTIVO:
            if valor_recibido < total:
                error_negocio("El monto recibido es menor al total de la venta.")
            cambio = valor_recibido - total
        elif metodo_pago == Venta.PAGO_NEQUI:
            valor_recibido = total
            cambio = 0
        elif metodo_pago == Venta.PAGO_DEBE:
            valor_recibido = 0
            cambio = 0
    else:
        # En venta abierta se conserva el monto preliminar digitado
        if metodo_pago == Venta.PAGO_EFECTIVO:
            cambio = max(0, valor_recibido - total)
        else:
            valor_recibido = 0
            cambio = 0

    ahora = timezone.now()
    venta = venta_existente or Venta(id=str(datos.get("id") or "") or None)
    if not venta.id:
        from .models import generar_id
        venta.id = generar_id()

    if not venta_existente and usuario and usuario.is_authenticated:
        venta.creado_por = usuario

    venta.actualizado_en = ahora
    venta.estado = estado_nuevo
    venta.cliente = cliente
    venta.metodo_pago = metodo_pago
    venta.subtotal = subtotal
    venta.iva = iva
    venta.descuento = descuento_obj
    venta.descuento_nombre_historico = desc_nombre
    venta.descuento_tipo_historico = desc_tipo
    venta.descuento_valor_historico = desc_valor
    venta.monto_descuento = monto_descuento
    venta.total = total
    venta.valor_recibido = valor_recibido
    venta.cambio = cambio
    venta.save()

    # Reemplazar las líneas de detalle (si venía de venta abierta)
    venta.items.all().delete()
    for l in lineas_preparadas:
        DetalleVenta.objects.create(
            venta=venta,
            producto=l["producto"],
            nombre_historico=l["nombre_historico"],
            precio_unitario=l["precio_unitario"],
            costo_unitario=l["costo_unitario"],
            cantidad=l["cantidad"],
            subtotal_linea=l["subtotal_linea"],
        )
        # Descontar stock únicamente cuando la venta pasa a estado CERRADA
        if estado_nuevo == Venta.ESTADO_CERRADA and l["producto"].seguimiento_inventario:
            l["producto"].stock -= l["cantidad"]
            l["producto"].save(update_fields=["stock"])

    return venta


# =====================================================================
# 4. CORRECCIÓN DE VENTAS CERRADAS (Requisito 3.4)
# =====================================================================

@transaction.atomic
def corregir_venta_cerrada(venta, datos, usuario=None):
    if venta.estado != Venta.ESTADO_CERRADA:
        error_negocio("Solo se pueden corregir ventas que estén cerradas.")

    if venta.reembolsos.exists():
        error_negocio("No se puede corregir una venta que ya tiene reembolsos registrados.")

    metodo_pago = datos.get("metodoPago") or datos.get("metodo_pago") or venta.metodo_pago
    if metodo_pago not in (Venta.PAGO_EFECTIVO, Venta.PAGO_NEQUI, Venta.PAGO_DEBE):
        error_negocio("Método de pago no válido.")

    cliente_id = datos.get("clienteId", datos.get("cliente_id", venta.cliente_id))
    cliente = None
    if cliente_id:
        cliente = Cliente.objects.filter(pk=str(cliente_id)).first()
        if not cliente:
            error_negocio("El cliente seleccionado no existe.")

    if metodo_pago == Venta.PAGO_DEBE and not cliente:
        error_negocio("Debes seleccionar un cliente para una venta con método Debe.")

    # Cantidades anteriores de la venta original
    cantidades_anteriores = {}
    precios_anteriores = {}
    for det in venta.items.all():
        cantidades_anteriores[det.producto_id] = (
            cantidades_anteriores.get(det.producto_id, 0) + det.cantidad
        )
        precios_anteriores[det.producto_id] = det.precio_unitario

    # Nuevas cantidades solicitadas en la corrección
    items_raw = extraer_items_payload(datos)
    cantidades_nuevas = {}
    orden_nuevas = []
    for linea in items_raw:
        prod_id = str(linea.get("productoId") or linea.get("id") or "").strip()
        try:
            cantidad = int(linea.get("cantidad", 0))
        except (TypeError, ValueError):
            cantidad = 0
        if not prod_id or cantidad <= 0:
            error_negocio("Producto o cantidad no válidos en la corrección.")
        if prod_id not in cantidades_nuevas:
            cantidades_nuevas[prod_id] = 0
            orden_nuevas.append(prod_id)
        cantidades_nuevas[prod_id] += cantidad

    todos_productos_ids = set(cantidades_anteriores.keys()) | set(cantidades_nuevas.keys())
    productos_map = {
        p.id: p
        for p in Producto.objects.select_for_update().filter(id__in=todos_productos_ids)
    }

    if len(productos_map) != len(todos_productos_ids):
        error_negocio("Uno o más productos indicados en la corrección no existen.")

    # Validar y ajustar diferencialmente el stock (Requisito 3.4)
    for prod_id, producto in productos_map.items():
        cant_ant = cantidades_anteriores.get(prod_id, 0)
        cant_nueva = cantidades_nuevas.get(prod_id, 0)
        diferencia = cant_nueva - cant_ant  # > 0 consume más stock; < 0 devuelve stock

        if producto.seguimiento_inventario and diferencia != 0:
            nuevo_stock = producto.stock - diferencia
            if nuevo_stock < 0:
                error_negocio(
                    f"La corrección dejaría stock negativo en '{producto.nombre}' "
                    f"(stock actual: {producto.stock}, incremento requerido: {diferencia})."
                )
            producto.stock = nuevo_stock
            producto.save(update_fields=["stock"])

    # Evaluar descuento (conservar el histórico si no se cambia explícitamente)
    if any(campo in datos for campo in ("descuentoId", "descuento_id", "descuentoPersonalizado")):
        (
            venta.descuento,
            venta.descuento_nombre_historico,
            venta.descuento_tipo_historico,
            venta.descuento_valor_historico,
        ) = resolver_descuento(datos, usuario, venta)

    # Reconstruir líneas y recalcular totales
    venta.items.all().delete()
    subtotal_acumulado = 0

    for prod_id in orden_nuevas:
        producto = productos_map[prod_id]
        cantidad = cantidades_nuevas[prod_id]
        # Si el producto ya estaba en la venta original, conservamos su precio histórico
        precio_unitario = precios_anteriores.get(prod_id, int(producto.precio))
        subtotal_linea = precio_unitario * cantidad
        subtotal_acumulado += subtotal_linea

        DetalleVenta.objects.create(
            venta=venta,
            producto=producto,
            nombre_historico=producto.nombre,
            precio_unitario=precio_unitario,
            costo_unitario=int(producto.costo),
            cantidad=cantidad,
            subtotal_linea=subtotal_linea,
        )

    subtotal, iva, monto_descuento, total = calcular_montos_venta(
        subtotal_acumulado,
        venta.descuento_tipo_historico,
        venta.descuento_valor_historico,
    )

    valor_recibido_raw = datos.get(
        "valorRecibido", datos.get("valor_recibido", venta.valor_recibido)
    )
    try:
        valor_recibido = int(round(float(valor_recibido_raw or 0)))
    except (TypeError, ValueError):
        valor_recibido = 0

    cambio = 0
    if metodo_pago == Venta.PAGO_EFECTIVO:
        if valor_recibido < total:
            valor_recibido = total
        cambio = valor_recibido - total
    elif metodo_pago == Venta.PAGO_NEQUI:
        valor_recibido = total
        cambio = 0
    elif metodo_pago == Venta.PAGO_DEBE:
        valor_recibido = 0
        cambio = 0

    ahora = timezone.now()
    venta.cliente = cliente
    venta.metodo_pago = metodo_pago
    venta.subtotal = subtotal
    venta.iva = iva
    venta.monto_descuento = monto_descuento
    venta.total = total
    venta.valor_recibido = valor_recibido
    venta.cambio = cambio
    venta.actualizado_en = ahora
    venta.corregida = True
    venta.fecha_correccion = ahora
    if usuario and usuario.is_authenticated:
        venta.corregida_por = usuario
    venta.save()

    return venta


# =====================================================================
# 5. REEMBOLSOS PARCIALES Y TOTALES (Requisito 3.5)
# =====================================================================

@transaction.atomic
def registrar_reembolso_venta(venta, datos, usuario=None):
    if venta.estado != Venta.ESTADO_CERRADA:
        error_negocio("Solo se pueden reembolsar ventas cerradas.")

    items_raw = extraer_items_payload(datos)
    retorna_global = datos.get("retornaInventario", datos.get("retorna_inventario", True))

    detalles_venta = {
        str(d.producto_id): d for d in venta.items.select_related("producto").all()
    }

    # Factor proporcional para respetar el IVA y el descuento aplicado en la venta
    subtotal_venta = int(venta.subtotal)
    total_venta = int(venta.total)
    factor_proporcional = (total_venta / subtotal_venta) if subtotal_venta > 0 else 0

    lineas_reembolso = []
    total_reembolsado = 0

    for item in items_raw:
        prod_id = str(item.get("productoId") or item.get("id") or "").strip()
        try:
            cantidad_a_devolver = int(item.get("cantidad", 0))
        except (TypeError, ValueError):
            cantidad_a_devolver = 0

        if not prod_id or cantidad_a_devolver <= 0:
            error_negocio("Selecciona productos y cantidades enteras positivas para reembolsar.")

        detalle_v = detalles_venta.get(prod_id)
        if not detalle_v:
            error_negocio(f"El producto {prod_id} no pertenece a esta venta.")

        ya_reembolsado = (
            DetalleReembolso.objects.filter(detalle_venta=detalle_v).aggregate(
                total=Sum("cantidad")
            )["total"]
            or 0
        )
        disponible = detalle_v.cantidad - ya_reembolsado
        if cantidad_a_devolver > disponible:
            error_negocio(
                f"No puedes reembolsar {cantidad_a_devolver} un. de '{detalle_v.nombre_historico}'. "
                f"Cantidad máxima reembolsable disponible: {disponible}."
            )

        retorna_item = item.get("retornaInventario", item.get("retorna_inventario", retorna_global))
        retorna_bool = bool(retorna_item) and str(retorna_item).lower() != "false"

        subtotal_bruto_linea = detalle_v.precio_unitario * cantidad_a_devolver
        monto_linea = int(round(subtotal_bruto_linea * factor_proporcional))
        total_reembolsado += monto_linea

        lineas_reembolso.append(
            {
                "detalle_venta": detalle_v,
                "producto_id": detalle_v.producto_id,
                "nombre_historico": detalle_v.nombre_historico,
                "cantidad": cantidad_a_devolver,
                "retorna_inventario": retorna_bool,
                "monto_reembolsado": monto_linea,
            }
        )

    # Resolver usuario que registra el reembolso
    user_obj = usuario if (usuario and usuario.is_authenticated) else venta.creado_por
    if not user_obj:
        from django.contrib.auth.models import User
        user_obj = User.objects.order_by("id").first()

    reembolso = Reembolso.objects.create(
        venta=venta,
        usuario=user_obj,
        total_reembolsado=total_reembolsado,
    )

    productos_bloqueados = {
        p.id: p
        for p in Producto.objects.select_for_update().filter(
            id__in=[l["producto_id"] for l in lineas_reembolso]
        )
    }

    for l in lineas_reembolso:
        prod = productos_bloqueados[l["producto_id"]]
        DetalleReembolso.objects.create(
            reembolso=reembolso,
            detalle_venta=l["detalle_venta"],
            producto=prod,
            nombre_historico=l["nombre_historico"],
            cantidad=l["cantidad"],
            retorna_inventario=l["retorna_inventario"],
            monto_reembolsado=l["monto_reembolsado"],
        )
        if l["retorna_inventario"] and prod.seguimiento_inventario:
            prod.stock += l["cantidad"]
            prod.save(update_fields=["stock"])

    return reembolso


# =====================================================================
# 6. COMPRAS E INCREMENTO DE INVENTARIO (Requisitos 3.1, 3.2, 3.9)
# =====================================================================

@transaction.atomic
def registrar_compra_servicio(datos, usuario=None):
    pk = str(datos.get("id") or "").strip()
    if pk and Compra.objects.filter(pk=pk).exists():
        error_negocio(f"Ya existe una compra con id {pk}.")

    proveedor_id = str(datos.get("proveedorId") or datos.get("proveedor_id") or "").strip()
    proveedor = Proveedor.objects.filter(pk=proveedor_id).first()
    if not proveedor:
        error_negocio("Selecciona un proveedor válido.")

    items_raw = extraer_items_payload(datos)
    lineas_agrupadas = {}
    orden_productos = []

    for item in items_raw:
        prod_id = str(item.get("productoId") or item.get("id") or "").strip()
        try:
            cantidad = int(item.get("cantidad", 0))
            costo = int(round(float(item.get("costo", 0))))
        except (TypeError, ValueError):
            error_negocio("Cantidad y costo deben ser números enteros válidos.")

        if not prod_id or cantidad <= 0 or costo < 0:
            error_negocio("Selecciona un producto, cantidad entera positiva y costo no negativo.")

        if prod_id not in lineas_agrupadas:
            lineas_agrupadas[prod_id] = {"cantidad": cantidad, "costo": costo}
            orden_productos.append(prod_id)
        else:
            if lineas_agrupadas[prod_id]["costo"] != costo:
                error_negocio("No puedes mezclar costos distintos para el mismo producto en una compra.")
            lineas_agrupadas[prod_id]["cantidad"] += cantidad

    productos_map = {
        p.id: p
        for p in Producto.objects.select_for_update().filter(id__in=orden_productos)
    }
    if len(productos_map) != len(orden_productos):
        error_negocio("Uno o más productos de la compra no existen.")

    compra = Compra(
        proveedor=proveedor,
        creado_por=usuario if (usuario and usuario.is_authenticated) else None,
    )
    if pk:
        compra.id = pk
    compra.save()

    total_compra = 0
    for prod_id in orden_productos:
        producto = productos_map[prod_id]
        info = lineas_agrupadas[prod_id]
        subtotal_linea = info["cantidad"] * info["costo"]
        total_compra += subtotal_linea

        DetalleCompra.objects.create(
            compra=compra,
            producto=producto,
            nombre_historico=producto.nombre,
            costo_unitario=info["costo"],
            cantidad=info["cantidad"],
            subtotal_linea=subtotal_linea,
        )

        # Actualizar costo y aumentar inventario del producto dentro de la transacción
        producto.costo = info["costo"]
        if producto.seguimiento_inventario:
            producto.stock += info["cantidad"]
            producto.save(update_fields=["costo", "stock"])
        else:
            producto.save(update_fields=["costo"])

    compra.total = total_compra
    compra.save(update_fields=["total"])
    return compra


# =====================================================================
# 7. REPORTES BÁSICOS POR RANGO DE FECHAS (Requisito 3.10)
# =====================================================================

def parsear_rango_fechas(fecha_inicio_str, fecha_fin_str):
    hoy = timezone.localdate()
    try:
        fecha_inicio = (
            datetime.strptime(fecha_inicio_str, "%Y-%m-%d").date()
            if fecha_inicio_str
            else hoy
        )
        fecha_fin = (
            datetime.strptime(fecha_fin_str, "%Y-%m-%d").date()
            if fecha_fin_str
            else fecha_inicio
        )
    except ValueError:
        error_negocio("Formato de fecha inválido. Utiliza YYYY-MM-DD.")

    if fecha_fin < fecha_inicio:
        error_negocio("La fecha final no puede ser anterior a la fecha inicial.")

    tz = timezone.get_current_timezone()
    dt_inicio = timezone.make_aware(datetime.combine(fecha_inicio, time.min), tz)
    dt_fin = timezone.make_aware(datetime.combine(fecha_fin, time.max), tz)
    return fecha_inicio, fecha_fin, dt_inicio, dt_fin
