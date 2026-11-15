// ARCHIVO PRINCIPAL - POS.JS
let productos = [];
let categorias = [];
let descuentosCatalogo = [];
let descuentoPuntualActual = null;

function payloadDescuentoFactura() {
  if (document.getElementById('select-descuento').value === '__puntual__' && descuentoPuntualActual) {
    if (descuentoPuntualActual.historico && ventaEnCorreccion) return {};
    return { descuentoId: '', descuentoPersonalizado: { tipo: descuentoPuntualActual.tipo, valor: descuentoPuntualActual.valor } };
  }
  const id = document.getElementById('select-descuento').value;
  return { descuentoId: id === '__puntual__' ? '' : id || '' };
}

function restaurarDescuentoVenta(venta) {
  descuentoPuntualActual = null;
  actualizarSelectDescuentosPOS();
  if (venta.descuentoId && descuentosCatalogo.some(d => d.id === String(venta.descuentoId))) {
    document.getElementById('select-descuento').value = String(venta.descuentoId);
  } else if (Number(venta.descuentoValor) > 0) {
    descuentoPuntualActual = { tipo: venta.descuentoTipo, valor: Number(venta.descuentoValor), historico: true };
    actualizarSelectDescuentosPOS();
    document.getElementById('select-descuento').value = '__puntual__';
  } else document.getElementById('select-descuento').value = '';
}

function guardarDescuentoPuntual(event) {
  event.preventDefault();
  if (!window.usuarioActual?.esAdmin) return;
  const tipo = document.getElementById('puntual-tipo').value;
  const valor = Number(document.getElementById('puntual-valor').value);
  if (!Number.isSafeInteger(valor) || valor <= 0 || (tipo === 'porcentaje' && valor > 100)) {
    mostrarNotificacion('Ingresa un valor entero positivo; el porcentaje no puede superar 100%.', 'error'); return;
  }
  descuentoPuntualActual = { tipo, valor };
  actualizarSelectDescuentosPOS(); document.getElementById('select-descuento').value = '__puntual__';
  calcularTotales(); guardarBorradorVenta(); document.getElementById('puntual-modal').classList.add('hidden');
  mostrarNotificacion('Descuento aplicado solo a esta factura.', 'exito');
}
let catalogoCargado = false;
let productosGuardando = false;

function adaptarProducto(producto) {
  const categoriaId = String(producto.categoriaId ?? "");
  return {
    ...producto,
    id: String(producto.id),
    categoriaId,
    codigo: String(producto.codigo ?? ""),
    nombre: String(producto.nombre ?? ""),
    categoria:
      producto.categoriaNombre ||
      categorias.find(c => c.id === categoriaId)?.nombre ||
      "Sin categoría",
    precio: Number(producto.precio),
    costo: Number(producto.costo),
    stock: Number(producto.stock),
    trackStock:
      producto.seguimientoInventario === true ||
      String(producto.seguimientoInventario).toLowerCase() === "true",
    descripcion: String(producto.descripcion ?? ""),
    imagenes: String(producto.imagenes ?? ""),
  };
}

function actualizarSelectDescuentosPOS() {
  const select = document.getElementById("select-descuento");
  if (!select) return;
  const actual = select.value;
  select.replaceChildren(new Option("Sin descuento", ""));
  descuentosCatalogo.forEach(d => {
    const etiqueta =
      d.tipo === "porcentaje"
        ? `${d.nombre} (${d.valor}%)`
        : `${d.nombre} (-$${Number(d.valor).toLocaleString("es-CO")})`;
    select.add(new Option(etiqueta, String(d.id)));
  });
  if (descuentoPuntualActual) select.add(new Option(`Solo esta venta (${descuentoPuntualActual.tipo === 'porcentaje' ? descuentoPuntualActual.valor + '%' : '$' + descuentoPuntualActual.valor.toLocaleString('es-CO')})`, '__puntual__'));
  if (actual && descuentosCatalogo.some(d => String(d.id) === actual)) {
    select.value = actual;
  }
  if (actual === '__puntual__' && descuentoPuntualActual) select.value = actual;
}

async function cargarCatalogoRemoto() {
  const estado = document.getElementById("catalogo-estado");
  const reintentar = document.getElementById("btn-reintentar-catalogo");
  const nuevo = document.getElementById("btn-new-product");
  catalogoCargado = false;
  if (nuevo) nuevo.disabled = true;
  reintentar.disabled = true;
  reintentar.classList.add("hidden");
  estado.textContent = "";
  const quitarSkeleton = mostrarSkeleton(
    productGrid,
    modoVistaLista ? "catalogo-lista" : "catalogo"
  );
  const quitarSkeletonCRUD = mostrarSkeleton(
    document.getElementById("products-table-body"),
    "tabla",
    7
  );
  try {
    const [datosProductos, datosCategorias, datosDescuentos] = await Promise.all([
      apiGet("productos"),
      apiGet("categorias"),
      apiGet("descuentos").catch(() => []),
    ]);
    if (!Array.isArray(datosProductos) || !Array.isArray(datosCategorias)) {
      throw new Error("La API debe devolver listas.");
    }
    categorias = datosCategorias.map(c => ({
      ...c,
      id: String(c.id),
      nombre: String(c.nombre),
    }));
    descuentosCatalogo = Array.isArray(datosDescuentos)
      ? datosDescuentos.map(d => ({
          id: String(d.id),
          nombre: String(d.nombre),
          tipo: String(d.tipo),
          valor: Number(d.valor),
        }))
      : [];
    productos = datosProductos.map(adaptarProducto);

    const select = document.getElementById("product-category");
    if (select) {
      select.replaceChildren(new Option("Selecciona una categoría", ""));
      categorias.forEach(c => select.add(new Option(c.nombre, c.id)));
    }
    actualizarSelectDescuentosPOS();

    catalogoCargado = true;
    renderizarProductos(obtenerProductosActuales());
    renderTablaCRUD(productos);
    estado.textContent = categorias.length
      ? ""
      : "No hay categorías disponibles en el servicio.";
  } catch (error) {
    estado.textContent = "No se pudo cargar el catálogo.";
    reintentar.classList.remove("hidden");
    mostrarNotificacion(error.message, "error");
  } finally {
    quitarSkeleton();
    quitarSkeletonCRUD();
    if (nuevo) nuevo.disabled = !catalogoCargado || categorias.length === 0;
    reintentar.disabled = false;
    iniciarBorradorVenta();
  }
}

let factura = [];
let ventaPendienteId = null;
let ventaPendiente = null;
let ventaAbiertaActualId = null;
let ventaAbiertaActualFecha = null;
let ventaAbiertaGuardadoPendiente = null;
// Estado para corrección de ventas cerradas (Requisito 3.4)
let ventaEnCorreccion = null;

let modoVistaLista = true;
const productGrid = document.querySelector("#product-grid");
const listaItemsFactura = document.querySelector("#invoice-items-list");
const subtotalValor = document.querySelector("#subtotal-valor");
const ivaValor = document.querySelector("#iva-valor");
const descuentoValor = document.querySelector("#descuento-valor");
const totalValor = document.querySelector("#total-valor");
const contadorProductos = document.querySelector("#total-products-count");
const btnLista = document.querySelector("#btn-lista");
const btnCatalogo = document.querySelector("#btn-catalogo");

function renderizarProductos(listaProductos) {
  if (!catalogoCargado) return;
  productGrid.innerHTML = "";
  if (contadorProductos) {
    contadorProductos.textContent = listaProductos.length;
  }
  if (listaProductos.length === 0) {
    productGrid.innerHTML = `<p class="empty-list-message">No hay productos disponibles.</p>`;
    return;
  }
  if (modoVistaLista) {
    const contenedorLista = document.createElement("div");
    contenedorLista.classList.add("pos-list-container");
    listaProductos.forEach(producto => {
      const fila = document.createElement("div");
      fila.classList.add("pos-list-row");

      fila.innerHTML = `
        <div class="pos-list-info">
          <div class="pos-list-header-group">
            <span class="product-cat-tag">${escaparHTML(producto.categoria)}</span>
            <h4 class="pos-list-title">${escaparHTML(producto.nombre)}</h4>
          </div>
          <span class="pos-list-desc">${producto.descripcion || ""}</span>
        </div>
        <div class="pos-list-price-container">
          <span class="pos-list-price">$${producto.precio.toLocaleString("es-CO")}</span>
        </div>
        <div class="pos-list-actions">
          <input type="number" value="1" min="1" class="cantidad-input pos-list-input" id="cantidad-${escaparHTML(producto.id)}">
          <button type="button" class="btn-añadir-carrito pos-list-btn">Agregar</button>
        </div>
      `;
      const botonAgregar = fila.querySelector(".btn-añadir-carrito");
      const inputCantidad = fila.querySelector(".cantidad-input");

      botonAgregar.addEventListener("click", () => {
        agregarAFactura(producto.id, inputCantidad.value);
      });
      const editar = document.createElement("button");
      editar.type = "button";
      editar.className = "btn-editar";
      editar.textContent = "Editar";
      editar.addEventListener("click", () =>
        openProductModal(producto.id, productos, true)
      );
      fila.querySelector(".pos-list-actions").appendChild(editar);
      contenedorLista.appendChild(fila);
    });
    productGrid.appendChild(contenedorLista);
  } else {
    listaProductos.forEach(producto => {
      const tarjeta = document.createElement("article");
      tarjeta.classList.add("product-card");

      const contenedorImagen = document.createElement("div");
      contenedorImagen.classList.add("product-image-container");
      const imagen = document.createElement("img");
      imagen.classList.add("product-image");
      imagen.alt = producto.nombre;

      if (producto.imagenes && producto.imagenes.trim() !== "") {
        imagen.src = producto.imagenes;
      } else {
        imagen.src = "https://via.placeholder.com/300x150?text=Sin+Imagen";
      }
      imagen.onerror = function () {
        this.onerror = null;
        this.src = "https://via.placeholder.com/300x150?text=Sin+Imagen";
      };
      contenedorImagen.appendChild(imagen);
      tarjeta.appendChild(contenedorImagen);

      const categoria = document.createElement("span");
      categoria.classList.add("product-cat-tag");
      categoria.textContent = producto.categoria;
      tarjeta.appendChild(categoria);

      const titulo = document.createElement("h3");
      titulo.classList.add("product-title");
      titulo.textContent = producto.nombre;
      tarjeta.appendChild(titulo);

      const descripcion = document.createElement("p");
      descripcion.classList.add("product-desc");
      descripcion.textContent = producto.descripcion;
      tarjeta.appendChild(descripcion);

      const pieProducto = document.createElement("div");
      pieProducto.classList.add("product-footer");
      const precio = document.createElement("p");
      precio.classList.add("product-price");
      precio.textContent = `$${producto.precio.toLocaleString("es-CO")}`;
      pieProducto.appendChild(precio);

      const controlesProducto = document.createElement("div");
      controlesProducto.classList.add("product-controls");
      const cantidad = document.createElement("input");
      cantidad.type = "number";
      cantidad.value = 1;
      cantidad.min = 1;
      cantidad.classList.add("cantidad-input");
      cantidad.id = `cantidad-${producto.id}`;

      const botonAgregar = document.createElement("button");
      botonAgregar.textContent = "Agregar";
      botonAgregar.classList.add("btn-añadir-carrito");
      botonAgregar.addEventListener("click", () => {
        agregarAFactura(producto.id, cantidad.value);
      });
      controlesProducto.appendChild(cantidad);
      controlesProducto.appendChild(botonAgregar);

      const editar = document.createElement("button");
      editar.type = "button";
      editar.className = "btn-editar";
      editar.textContent = "Editar";
      editar.addEventListener("click", () =>
        openProductModal(producto.id, productos, true)
      );
      controlesProducto.appendChild(editar);
      pieProducto.appendChild(controlesProducto);
      tarjeta.appendChild(pieProducto);
      productGrid.appendChild(tarjeta);
    });
  }
}

function stockDisponibleParaPOS(productoId) {
  const producto = productos.find(p => p.id === productoId);
  if (!producto || !producto.trackStock) return Infinity;
  let extraOriginal = 0;
  if (ventaEnCorreccion && Array.isArray(ventaEnCorreccion.items)) {
    const itemOrig = ventaEnCorreccion.items.find(
      i => String(i.productoId) === String(productoId)
    );
    if (itemOrig) extraOriginal = Number(itemOrig.cantidad) || 0;
  }
  return producto.stock + extraOriginal;
}

function agregarAFactura(productoId, cantidadIngresada) {
  if (
    !catalogoCargado ||
    productosGuardando ||
    ventaPendiente ||
    ventaAbiertaGuardadoPendiente ||
    compraPendiente
  )
    return;
  let cantidad = Number(cantidadIngresada);
  if (cantidad < 1 || isNaN(cantidad)) {
    cantidad = 1;
  }
  const producto = productos.find(p => p.id === productoId);
  if (!producto) return;
  const productoExistente = factura.find(item => item.id === productoId);
  const cantidadActual = productoExistente ? productoExistente.cantidad : 0;
  const cantidadFinal = cantidadActual + cantidad;
  const maxStock = stockDisponibleParaPOS(productoId);

  if (producto.trackStock && cantidadFinal > maxStock) {
    mostrarNotificacion(
      `Stock insuficiente. Solo hay ${maxStock} unidades disponibles.`,
      "error"
    );
    return;
  }
  if (productoExistente) {
    productoExistente.cantidad += cantidad;
  } else {
    factura.push({
      ...producto,
      cantidad: cantidad,
    });
  }
  renderizarFactura();
}

function renderizarFactura() {
  listaItemsFactura.innerHTML = "";
  if (factura.length === 0) {
    listaItemsFactura.innerHTML = `
      <div class="empty-invoice-state">
        <p>🛒 La factura está vacía</p>
        <small>Agrega productos desde el catálogo.</small>
      </div>`;
    calcularTotales();
    guardarBorradorVenta();
    return;
  }
  factura.forEach(item => {
    const fila = document.createElement("div");
    fila.classList.add("invoice-item-row");
    const detalles = document.createElement("div");
    detalles.classList.add("item-details");
    const nombre = document.createElement("h4");
    nombre.textContent = item.nombre;
    detalles.appendChild(nombre);
    const subtotalProducto = Math.round(item.precio * item.cantidad);
    const detallesPrecio = document.createElement("p");
    detallesPrecio.textContent = `$${item.precio.toLocaleString("es-CO")} x ${item.cantidad} = $${subtotalProducto.toLocaleString("es-CO")}`;
    detalles.appendChild(detallesPrecio);
    fila.appendChild(detalles);

    const acciones = document.createElement("div");
    acciones.classList.add("item-actions");
    const botonMenos = document.createElement("button");
    botonMenos.textContent = "-";
    botonMenos.classList.add("btn-cantidad-input");
    const botonMas = document.createElement("button");
    botonMas.textContent = "+";
    botonMas.classList.add("btn-cantidad-input");
    const cantidadTexto = document.createElement("span");
    cantidadTexto.textContent = item.cantidad;
    const botonEliminar = document.createElement("button");
    botonEliminar.textContent = "🗑️";
    botonEliminar.classList.add("btn-borrar");

    botonMas.addEventListener("click", () => cambiarCantidad(item.id, 1));
    botonMenos.addEventListener("click", () => cambiarCantidad(item.id, -1));
    botonEliminar.addEventListener("click", () => eliminarProducto(item.id));

    acciones.appendChild(botonMenos);
    acciones.appendChild(cantidadTexto);
    acciones.appendChild(botonMas);
    acciones.appendChild(botonEliminar);
    fila.appendChild(acciones);
    listaItemsFactura.appendChild(fila);
  });
  calcularTotales();
  guardarBorradorVenta();
}

function cambiarCantidad(productoId, cambio) {
  if (
    productosGuardando ||
    ventaPendiente ||
    ventaAbiertaGuardadoPendiente ||
    compraPendiente
  )
    return;
  const producto = factura.find(item => item.id === productoId);
  if (!producto) return;
  const nuevaCantidad = producto.cantidad + cambio;
  if (nuevaCantidad < 1) return;
  const maxStock = stockDisponibleParaPOS(productoId);
  if (cambio > 0 && nuevaCantidad > maxStock) {
    mostrarNotificacion(
      `No puedes superar el stock disponible (${maxStock}).`,
      "error"
    );
    return;
  }
  producto.cantidad = nuevaCantidad;
  renderizarFactura();
}

function eliminarProducto(productoId) {
  if (
    productosGuardando ||
    ventaPendiente ||
    ventaAbiertaGuardadoPendiente ||
    compraPendiente
  )
    return;
  factura = factura.filter(item => item.id !== productoId);
  renderizarFactura();
}

function obtenerDesgloseFacturaActual() {
  const subtotal = Math.round(
    factura.reduce((acum, item) => acum + item.precio * item.cantidad, 0)
  );
  const iva = Math.round(subtotal * 0.19);
  const totalBruto = subtotal + iva;

  const selectDesc = document.getElementById("select-descuento");
  const descuentoId = selectDesc ? selectDesc.value : "";
  const descObj = descuentoId === '__puntual__' ? descuentoPuntualActual : descuentosCatalogo.find(d => String(d.id) === String(descuentoId));

  let montoDescuento = 0;
  if (descObj && totalBruto > 0) {
    if (descObj.tipo === "porcentaje") {
      montoDescuento = Math.round(totalBruto * (descObj.valor / 100));
    } else if (descObj.tipo === "fijo") {
      montoDescuento = Math.round(descObj.valor);
    }
    if (montoDescuento > totalBruto) {
      montoDescuento = totalBruto;
    }
  }
  const total = Math.max(0, totalBruto - montoDescuento);
  return { subtotal, iva, montoDescuento, total, descuentoId };
}

function calcularTotales() {
  const { subtotal, iva, montoDescuento, total } = obtenerDesgloseFacturaActual();
  subtotalValor.textContent = `$${subtotal.toLocaleString("es-CO")}`;
  ivaValor.textContent = `$${iva.toLocaleString("es-CO")}`;
  if (descuentoValor) {
    descuentoValor.textContent = `-$${montoDescuento.toLocaleString("es-CO")}`;
  }
  totalValor.textContent = `$${total.toLocaleString("es-CO")}`;
  actualizarCalculoCambio();
}

const searchInput = document.querySelector("#search-input");
function obtenerProductosActuales() {
  if (!searchInput) return productos;
  const textoBusqueda = searchInput.value.toLowerCase();
  return productos.filter(
    producto =>
      producto.nombre.toLowerCase().includes(textoBusqueda) ||
      producto.categoria.toLowerCase().includes(textoBusqueda) ||
      producto.codigo.toLowerCase().includes(textoBusqueda)
  );
}
if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderizarProductos(obtenerProductosActuales());
  });
}

if (btnLista && btnCatalogo) {
  btnLista.addEventListener("click", () => {
    modoVistaLista = true;
    btnLista.classList.add("active");
    btnCatalogo.classList.remove("active");
    renderizarProductos(obtenerProductosActuales());
  });
  btnCatalogo.addEventListener("click", () => {
    modoVistaLista = false;
    btnCatalogo.classList.add("active");
    btnLista.classList.remove("active");
    renderizarProductos(obtenerProductosActuales());
  });
}

const botonVaciar = document.querySelector("#btn-vaciar");
if (botonVaciar) {
  botonVaciar.addEventListener("click", () => {
    if (
      productosGuardando ||
      ventaPendiente ||
      ventaAbiertaGuardadoPendiente ||
      compraPendiente
    )
      return;
    factura = [];
    eliminarBorradorVenta();
    renderizarFactura();
  });
}

const selectPago = document.querySelector("#select-pago");
const grupoEfectivo = document.querySelector("#grupo-efectivo");
const inputRecibido = document.querySelector("#monto-recibido");
const cambioValor = document.querySelector("#cambio-valor");
const selectDescuento = document.querySelector("#select-descuento");

if (selectDescuento) {
  selectDescuento.addEventListener("change", () => {
    if (selectDescuento.value !== '__puntual__') {
      descuentoPuntualActual = null;
      actualizarSelectDescuentosPOS();
    }
    calcularTotales();
    guardarBorradorVenta();
  });
}

function calcularTotalVenta() {
  return obtenerDesgloseFacturaActual().total;
}

function actualizarCalculoCambio() {
  if (!inputRecibido || !cambioValor) return;
  const total = calcularTotalVenta();
  const recibido = Math.round(Number(inputRecibido.value) || 0);
  const cambio = recibido - total;
  if (recibido === 0 || cambio < 0) {
    cambioValor.textContent = "$0";
  } else {
    cambioValor.textContent = `$${Math.round(cambio).toLocaleString("es-CO")}`;
  }
}

selectPago.addEventListener("change", () => {
  if (selectPago.value === "Efectivo") {
    grupoEfectivo.classList.remove("hidden");
  } else {
    grupoEfectivo.classList.add("hidden");
    inputRecibido.value = "";
    cambioValor.textContent = "$0";
  }
});
if (inputRecibido) {
  inputRecibido.addEventListener("input", actualizarCalculoCambio);
}

// --- MODO CORRECCIÓN DE VENTA CERRADA (Requisito 3.4) ---
function iniciarCorreccionVenta(venta) {
  if (!window.usuarioActual?.esAdmin) return;
  if (venta.tieneReembolsos) { mostrarNotificacion('Esta venta tiene reembolsos y no admite corrección.', 'advertencia'); return; }
  if (
    !catalogoCargado ||
    productosGuardando ||
    ventaPendiente ||
    ventaAbiertaGuardadoPendiente ||
    compraPendiente
  ) {
    mostrarNotificacion("Termina la operación actual antes de corregir.", "error");
    return;
  }
  ventaEnCorreccion = venta;
  ventaAbiertaActualId = null;
  ventaAbiertaActualFecha = null;
  eliminarBorradorVenta();

  factura = venta.items.map(i => {
    const prod = productos.find(p => p.id === String(i.productoId));
    return {
      ...(prod || {}),
      id: String(i.productoId),
      nombre: String(i.nombre),
      precio: Number(i.precio),
      costo: Number(i.costo || prod?.costo || 0),
      cantidad: Number(i.cantidad),
      trackStock: prod ? prod.trackStock : true,
      stock: prod ? prod.stock : 0,
    };
  });

  document.getElementById("select-cliente").value = String(venta.clienteId || "");
  restaurarDescuentoVenta(venta);
  selectPago.value = venta.metodoPago || "Efectivo";
  selectPago.dispatchEvent(new Event("change"));
  inputRecibido.value = venta.metodoPago === "Efectivo" ? venta.recibido : "";

  document.getElementById("venta-abierta-estado").textContent =
    `Corrigiendo venta cerrada ${referenciaVisible(venta.id, "VTA")}`;
  document.getElementById("btn-finalizar").textContent = "Guardar Corrección";
  document.getElementById("btn-guardar-abierta").classList.add("hidden");
  document.getElementById("btn-cancelar-correccion").classList.remove("hidden");

  renderizarFactura();
  document.getElementById("btn-nav-pos").click();
}

function cancelarModoCorreccion() {
  ventaEnCorreccion = null;
  factura = [];
  document.getElementById("select-cliente").value = "";
  if (selectDescuento) selectDescuento.value = "";
  descuentoPuntualActual = null;
  selectPago.value = "Efectivo";
  selectPago.dispatchEvent(new Event("change"));
  inputRecibido.value = "";
  document.getElementById("venta-abierta-estado").textContent = "";
  document.getElementById("btn-finalizar").textContent = "Finalizar Venta";
  document.getElementById("btn-guardar-abierta").classList.remove("hidden");
  document.getElementById("btn-cancelar-correccion").classList.add("hidden");
  renderizarFactura();
}

const btnCancelarCorreccion = document.getElementById("btn-cancelar-correccion");
if (btnCancelarCorreccion) {
  btnCancelarCorreccion.addEventListener("click", cancelarModoCorreccion);
}

const botonFinalizar = document.querySelector("#btn-finalizar");
if (botonFinalizar) {
  botonFinalizar.addEventListener("click", async () => {
    if (!catalogoCargado || productosGuardando || compraPendiente) return;
    if (ventaAbiertaGuardadoPendiente) {
      mostrarNotificacion(
        "Primero reintenta guardar la venta abierta pendiente.",
        "error"
      );
      return;
    }
    if (factura.length === 0) {
      mostrarNotificacion("La factura está vacía.", "error");
      return;
    }

    const { subtotal, total, descuentoId } = obtenerDesgloseFacturaActual();
    const metodoPago = selectPago.value;
    const clienteId = document.getElementById("select-cliente").value;
    if (!validarClienteVenta(metodoPago, clienteId)) return;

    let recibido = 0;
    let cambio = 0;
    if (metodoPago === "Efectivo") {
      recibido = Math.round(Number(inputRecibido.value) || 0);
      if (recibido < total) {
        mostrarNotificacion(
          "El monto recibido es menor al total de la venta.",
          "error"
        );
        return;
      }
      cambio = Math.round(recibido - total);
    } else if (metodoPago === "Nequi") {
      recibido = total;
    }

    const itemsVenta = factura.map(item => ({
      productoId: item.id,
      nombre: item.nombre,
      precio: item.precio,
      costo: item.costo,
      cantidad: item.cantidad,
    }));

    // Si estamos corrigiendo una venta cerrada (Requisito 3.4)
    if (ventaEnCorreccion) {
      productosGuardando = true;
      botonFinalizar.disabled = true;
      try {
        await apiCorregirVenta(ventaEnCorreccion.id, {
          clienteId,
          metodoPago,
          ...payloadDescuentoFactura(),
          valorRecibido: recibido,
          items: itemsVenta,
        });
        cancelarModoCorreccion();
        await cargarCatalogoRemoto();
        await renderHistorial(true);
        mostrarNotificacion(
          "Venta corregida e inventario ajustado correctamente.",
          "exito"
        );
      } catch (error) {
        mostrarNotificacion(error.message, "error");
      } finally {
        productosGuardando = false;
        botonFinalizar.disabled = false;
      }
      return;
    }

    // Flujo normal: Crear o cerrar venta abierta
    const ahora = new Date().toISOString();
    const nuevaVenta = {
      id: ventaPendienteId || ventaAbiertaActualId || crypto.randomUUID(),
      fecha: ventaAbiertaActualFecha || ahora,
      estado: "cerrada",
      clienteId,
      ...payloadDescuentoFactura(),
      metodoPago,
      subtotal,
      total,
      valorRecibido: recibido,
      cambio,
      items: itemsVenta,
      itemsJson: itemsVenta,
      actualizadoEn: ahora,
    };

    const action = ventaAbiertaActualId ? "update" : "create";
    ventaPendienteId = nuevaVenta.id;
    marcarEscrituraBorrador(nuevaVenta.id);
    productosGuardando = true;
    botonFinalizar.disabled = true;

    try {
      await apiPost("ventas", action, nuevaVenta);
      ventaPendienteId = null;
      ventaPendiente = null;
      ventaAbiertaActualId = null;
      ventaAbiertaActualFecha = null;
      eliminarBorradorVenta();
      document.getElementById("select-cliente").value = "";
      if (selectDescuento) selectDescuento.value = "";
      descuentoPuntualActual = null;
      document.getElementById("venta-abierta-estado").textContent = "";
      botonFinalizar.textContent = "Finalizar Venta";
      factura = [];
      inputRecibido.value = "";
      cambioValor.textContent = "$0";
      selectPago.value = "Efectivo";
      grupoEfectivo.classList.remove("hidden");
      renderizarFactura();
      await cargarCatalogoRemoto();
      mostrarNotificacion(
        "Venta registrada correctamente. Puedes imprimirla desde el historial.",
        "exito"
      );
      renderHistorial(true);
    } catch (error) {
      mostrarNotificacion(`No se pudo registrar la venta: ${error.message}`, "error");
    } finally {
      productosGuardando = false;
      botonFinalizar.disabled = false;
    }
  });
}

renderizarProductos(productos);
renderizarFactura();
