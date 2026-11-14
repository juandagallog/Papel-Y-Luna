from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    PerfilUsuario,
    Categoria,
    Proveedor,
    Cliente,
    Producto,
    Descuento,
    Venta,
    Faltante,
)


class PapelYLunaMVP3Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Usuarios con roles
        self.admin_user = User.objects.create_user(
            username="admin_test", password="Password123!", first_name="Admin"
        )
        PerfilUsuario.objects.create(
            usuario=self.admin_user, rol=PerfilUsuario.ROL_ADMIN
        )

        self.cajero_user = User.objects.create_user(
            username="cajero_test", password="Password123!", first_name="Cajero"
        )
        PerfilUsuario.objects.create(
            usuario=self.cajero_user, rol=PerfilUsuario.ROL_CAJERO
        )

        # Datos base
        self.categoria = Categoria.objects.create(
            id="cat-01", nombre="Papelería General"
        )
        self.proveedor = Proveedor.objects.create(
            id="prov-01",
            nombre="Distribuidora Escolar",
            telefono="3001112233",
            correo="contacto@escolar.co",
        )
        self.cliente = Cliente.objects.create(
            id="cli-01",
            nombre="Juan Pérez",
            telefono="3109998877",
            correo="juan@correo.co",
        )
        self.producto = Producto.objects.create(
            id="prod-01",
            codigo="PROD-001",
            nombre="Cuaderno Argollado",
            categoria=self.categoria,
            precio=10000,
            costo=6000,
            seguimiento_inventario=True,
            stock=10,
        )

    def login_admin(self):
        self.client.login(username="admin_test", password="Password123!")

    def login_cajero(self):
        self.client.login(username="cajero_test", password="Password123!")

    # =====================================================================
    # 1. PRUEBAS DE VENTAS Y VENTAS ABIERTAS
    # =====================================================================
    def test_flujo_ventas_stock_y_metodos_pago(self):
        self.login_cajero()

        # 1. Intentar superar stock disponible (stock=10, pedimos 15) -> Rechazo 400
        res_exceso = self.client.post(
            "/api/ventas/",
            {
                "estado": "cerrada",
                "metodoPago": "Efectivo",
                "valorRecibido": 200000,
                "items": [{"productoId": self.producto.id, "cantidad": 15}],
            },
            format="json",
        )
        self.assertEqual(res_exceso.status_code, 400)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 10)

        # 2. Pagar con Debe sin cliente -> Rechazo 400
        res_debe_sin_cli = self.client.post(
            "/api/ventas/",
            {
                "estado": "cerrada",
                "metodoPago": "Debe",
                "items": [{"productoId": self.producto.id, "cantidad": 1}],
            },
            format="json",
        )
        self.assertEqual(res_debe_sin_cli.status_code, 400)

        # 3. Guardar venta abierta (no debe descontar stock)
        res_abierta = self.client.post(
            "/api/ventas/",
            {
                "id": "vta-abierta-1",
                "estado": "abierta",
                "metodoPago": "Efectivo",
                "items": [{"productoId": self.producto.id, "cantidad": 2}],
            },
            format="json",
        )
        self.assertEqual(res_abierta.status_code, 201)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 10)

        # 4. Retomar y cerrar la venta abierta en Efectivo -> Descuenta stock a 8
        res_cerrar = self.client.put(
            "/api/ventas/vta-abierta-1/",
            {
                "id": "vta-abierta-1",
                "estado": "cerrada",
                "metodoPago": "Efectivo",
                "valorRecibido": 30000,
                "items": [{"productoId": self.producto.id, "cantidad": 2}],
            },
            format="json",
        )
        self.assertEqual(res_cerrar.status_code, 200)
        self.assertEqual(res_cerrar.data["subtotal"], 20000)
        self.assertEqual(res_cerrar.data["iva"], 3800)
        self.assertEqual(res_cerrar.data["total"], 23800)
        self.assertEqual(res_cerrar.data["cambio"], 6200)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 8)

    # =====================================================================
    # 2. PRUEBAS DE COMPRAS E INVENTARIO
    # =====================================================================
    def test_registro_compra_incrementa_stock(self):
        self.login_admin()
        res = self.client.post(
            "/api/compras/",
            {
                "id": "cmp-01",
                "proveedorId": self.proveedor.id,
                "items": [
                    {
                        "productoId": self.producto.id,
                        "cantidad": 5,
                        "costo": 6500,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["total"], 32500)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 15)
        self.assertEqual(self.producto.costo, 6500)

    # =====================================================================
    # 3. PRUEBAS DE CORRECCIÓN DE VENTAS CERRADAS
    # =====================================================================
    def test_correccion_venta_mantiene_id_y_ajusta_stock(self):
        self.login_admin()
        # Crear venta inicial de 3 unidades (stock pasa de 10 a 7)
        self.client.post(
            "/api/ventas/",
            {
                "id": "vta-corr-1",
                "estado": "cerrada",
                "metodoPago": "Nequi",
                "items": [{"productoId": self.producto.id, "cantidad": 3}],
            },
            format="json",
        )
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 7)

        # Intentar corregir a 12 unidades (supera las 10 totales posibles) -> Rechazo 400
        res_invalida = self.client.post(
            "/api/ventas/vta-corr-1/corregir/",
            {
                "metodoPago": "Nequi",
                "items": [{"productoId": self.producto.id, "cantidad": 12}],
            },
            format="json",
        )
        self.assertEqual(res_invalida.status_code, 400)

        # Corregir de 3 a 5 unidades -> stock debe bajar en 2 (de 7 a 5)
        res_ok = self.client.post(
            "/api/ventas/vta-corr-1/corregir/",
            {
                "metodoPago": "Debe",
                "clienteId": self.cliente.id,
                "items": [{"productoId": self.producto.id, "cantidad": 5}],
            },
            format="json",
        )
        self.assertEqual(res_ok.status_code, 200)
        self.assertEqual(res_ok.data["id"], "vta-corr-1")
        self.assertTrue(res_ok.data["corregida"])
        self.assertEqual(res_ok.data["corregidaPor"], "Admin")
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 5)

    # =====================================================================
    # 4. PRUEBAS DE DESCUENTOS E INMUTABILIDAD HISTÓRICA
    # =====================================================================
    def test_descuentos_e_inmutabilidad_historica(self):
        self.login_admin()
        # Crear descuento fijo de $50000 (mayor que una venta de $11900) para probar piso 0
        desc_fijo = Descuento.objects.create(
            id="desc-fijo", nombre="Bono Regalo", tipo="fijo", valor=50000
        )
        res_venta = self.client.post(
            "/api/ventas/",
            {
                "id": "vta-desc-1",
                "estado": "cerrada",
                "metodoPago": "Nequi",
                "descuentoId": desc_fijo.id,
                "items": [{"productoId": self.producto.id, "cantidad": 1}],
            },
            format="json",
        )
        self.assertEqual(res_venta.status_code, 201)
        # El total nunca puede ser negativo
        self.assertEqual(res_venta.data["total"], 0)
        self.assertEqual(res_venta.data["descuentoNombre"], "Bono Regalo")

        # Eliminar el descuento del catálogo NO debe alterar la venta histórica
        self.client.delete(f"/api/descuentos/{desc_fijo.id}/")
        res_hist = self.client.get("/api/ventas/vta-desc-1/")
        self.assertEqual(res_hist.status_code, 200)
        self.assertEqual(res_hist.data["descuentoNombre"], "Bono Regalo")
        self.assertEqual(res_hist.data["total"], 0)

    # =====================================================================
    # 5. PRUEBAS DE REEMBOLSOS CON DESCUENTO PROPORCIONAL
    # =====================================================================
    def test_reembolso_parcial_total_y_retorno_inventario(self):
        self.login_admin()
        desc_10 = Descuento.objects.create(
            id="desc-10", nombre="10% Off", tipo="porcentaje", valor=10
        )
        # Venta de 2 unidades: Subtotal 20000, IVA 3800, Bruto 23800, Desc 2380, Total 21420
        self.client.post(
            "/api/ventas/",
            {
                "id": "vta-reemb-1",
                "estado": "cerrada",
                "metodoPago": "Efectivo",
                "valorRecibido": 25000,
                "descuentoId": desc_10.id,
                "items": [{"productoId": self.producto.id, "cantidad": 2}],
            },
            format="json",
        )
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 8)

        # Intentar reembolsar 3 unidades (más de las 2 vendidas) -> Rechazo 400
        res_exceso = self.client.post(
            "/api/ventas/vta-reemb-1/reembolsos/",
            {
                "retornaInventario": True,
                "items": [{"productoId": self.producto.id, "cantidad": 3}],
            },
            format="json",
        )
        self.assertEqual(res_exceso.status_code, 400)

        # Reembolsar 1 unidad con retorno a inventario -> Valor proporcional 10710 y stock sube a 9
        res_parcial = self.client.post(
            "/api/ventas/vta-reemb-1/reembolsos/",
            {
                "retornaInventario": True,
                "items": [{"productoId": self.producto.id, "cantidad": 1}],
            },
            format="json",
        )
        self.assertEqual(res_parcial.status_code, 201)
        self.assertEqual(res_parcial.data["totalReembolsado"], 10710)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock, 9)

    # =====================================================================
    # 6. PRUEBAS DE FALTANTES Y AGRUPACIÓN NORMALIZADA
    # =====================================================================
    def test_faltantes_normalizacion_y_agrupacion(self):
        self.login_cajero()
        self.client.post(
            "/api/faltantes/",
            {
                "descripcion": "Borradores de Nata",
                "cantidadSolicitada": 4,
                "tipo": "inexistente",
                "proveedorId": self.proveedor.id,
            },
            format="json",
        )
        self.client.post(
            "/api/faltantes/",
            {
                "descripcion": "borrador de nata",
                "cantidadSolicitada": 6,
                "tipo": "inexistente",
                "proveedorId": self.proveedor.id,
            },
            format="json",
        )

        res_agrupados = self.client.get("/api/faltantes/agrupados/")
        self.assertEqual(res_agrupados.status_code, 200)
        self.assertEqual(len(res_agrupados.data), 1)
        self.assertEqual(
            res_agrupados.data[0]["nombreNormalizado"], "borrador de nata"
        )
        self.assertEqual(res_agrupados.data[0]["cantidadTotalSolicitada"], 10)

    # =====================================================================
    # 7. PRUEBAS DE PERMISOS (CAJERO VS ADMINISTRADOR)
    # =====================================================================
    def test_bloqueo_operaciones_administrativas_a_cajero(self):
        self.login_cajero()

        # Cajero NO puede crear categorías, proveedores, compras ni ver reportes
        self.assertEqual(
            self.client.post("/api/categorias/", {"nombre": "Nueva"}).status_code,
            403,
        )
        self.assertEqual(
            self.client.post("/api/compras/", {}).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/reportes/").status_code,
            403,
        )