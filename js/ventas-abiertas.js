function validarClienteVenta(metodoPago, clienteId) {
  if (metodoPago === "Debe" && !clienteId) {
    mostrarNotificacion(
      "Debes seleccionar un cliente para una venta con método Debe.",
      "error"
    );
    return false;
  }
  if (
    clienteId &&
    (!clientesCargados || !clientes.some(c => c.id === clienteId))
  ) {
    mostrarNotificacion(
      "Selecciona un cliente válido. Si es necesario, recarga Clientes.",
      "error"
    );
    return false;
  }
  return true;
}

async function guardarVentaAbierta() {
  if (
    !catalogoCargado ||
    productosGuardando ||
    ventaPendiente ||
    compraPendiente ||
    ventaEnCorreccion
  )
    return;
  if (!factura.length) {
    mostrarNotificacion("La factura está vacía.", "error");
    return;
  }
  const metodoPago = selectPago.value;
  const clienteId = document.getElementById("select-cliente").value;
  if (!validarClienteVenta(metodoPago, clienteId)) return;

  const ahora = new Date().toISOString();
  const { subtotal, total, descuentoId } = obtenerDesgloseFacturaActual();
  const valorRecibido =
    metodoPago === "Efectivo" ? Math.round(Number(inputRecibido.value || 0)) : 0;

  const items = factura.map(i => ({
    productoId: i.id,
    nombre: i.nombre,
    precio: i.precio,
    costo: i.costo,
    cantidad: i.cantidad,
  }));

  const venta = {
    id: ventaAbiertaActualId || crypto.randomUUID(),
    fecha: ventaAbiertaActualFecha || ahora,
    actualizadoEn: ahora,
    estado: "abierta",
    clienteId,
    descuentoId,
    metodoPago,
    subtotal,
    total,
    valorRecibido,
    cambio:
      metodoPago === "Efectivo" ? Math.max(0, Math.round(valorRecibido - total)) : 0,
    items,
    itemsJson: items,
  };

  const action = ventaAbiertaActualId ? "update" : "create";
  const boton = document.getElementById("btn-guardar-abierta");
  productosGuardando = true;
  boton.disabled = true;
  botonFinalizar.disabled = true;

  try {
    await apiPost("ventas", action, venta);
    eliminarBorradorVenta();
    ventaAbiertaGuardadoPendiente = null;
    ventaAbiertaActualId = null;
    ventaAbiertaActualFecha = null;
    ventaPendienteId = null;
    factura = [];
    document.getElementById("select-cliente").value = "";
    const selDesc = document.getElementById("select-descuento");
    if (selDesc) selDesc.value = "";
    document.getElementById("venta-abierta-estado").textContent = "";
    selectPago.value = "Efectivo";
    inputRecibido.value = "";
    grupoEfectivo.classList.remove("hidden");
    cambioValor.textContent = "$0";
    renderizarFactura();
    mostrarNotificacion(
      "Venta abierta guardada. Puedes retomarla desde el historial.",
      "exito"
    );
    renderHistorial(true);
  } catch (error) {
    mostrarNotificacion("No se pudo guardar la venta abierta: " + error.message, "error");
  } finally {
    productosGuardando = false;
    boton.disabled = false;
    botonFinalizar.disabled = false;
  }
}

async function retomarVentaAbierta(id) {
  if (
    !catalogoCargado ||
    productosGuardando ||
    ventaPendiente ||
    ventaAbiertaGuardadoPendiente ||
    compraPendiente ||
    ventaEnCorreccion
  ) {
    mostrarNotificacion(
      "Termina la operación pendiente o espera la carga del catálogo.",
      "error"
    );
    return;
  }
  if (
    factura.length &&
    !window.confirm("¿Reemplazar el carrito actual por esta venta abierta?")
  )
    return;
  productosGuardando = true;
  try {
    const venta = (await apiGet("ventas")).find(v => String(v.id) === String(id));
    if (!venta || venta.estado !== "abierta") {
      throw new Error("Esta venta ya no está abierta. Recarga el historial.");
    }
    if (!clientesCargados) await cargarClientes();
    const adaptada = adaptarVentaRemota(venta);
    const items = adaptada.items.map(i => {
      const producto = productos.find(p => p.id === String(i.productoId));
      return {
        ...producto,
        id: String(i.productoId),
        nombre: String(i.nombre),
        precio: Number(i.precio),
        costo: Number(i.costo),
        cantidad: Number(i.cantidad),
      };
    });
    factura = items;
    eliminarBorradorVenta();
    ventaAbiertaActualId = String(venta.id);
    ventaAbiertaActualFecha = venta.fecha;
    const select = document.getElementById("select-cliente");
    const clienteId = String(venta.clienteId || "");
    if (clienteId && ![...select.options].some(o => o.value === clienteId)) {
      select.add(new Option(nombreCliente(clienteId), clienteId));
    }
    select.value = clienteId;
    const selDesc = document.getElementById("select-descuento");
    if (selDesc) selDesc.value = String(venta.descuentoId || "");
    selectPago.value = venta.metodoPago;
    selectPago.dispatchEvent(new Event("change"));
    inputRecibido.value = adaptada.recibido;
    document.getElementById("venta-abierta-estado").textContent =
      `Editando venta abierta ${referenciaVisible(ventaAbiertaActualId, "VTA")}`;
    renderizarFactura();
    actualizarCalculoCambio();
    document.getElementById("btn-nav-pos").click();
  } catch (error) {
    mostrarNotificacion(error.message, "error");
  } finally {
    productosGuardando = false;
  }
}