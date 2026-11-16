let lineasCompra = [];
let compraPendiente = null;
let comprasEnCarga = null;

function actualizarProductosCompra() {
  const select = document.getElementById("compra-producto");
  if (!select) return;
  const id = select.value;
  select.replaceChildren(new Option("Selecciona un producto", ""));
  productos.forEach(p => select.add(new Option(p.nombre, p.id)));
  select.value = id;
}

function renderLineasCompra() {
  const body = document.getElementById("compra-items");
  if (!body) return;
  body.closest('table').classList.add('tabla-fichas');
  body.replaceChildren();
  if (!lineasCompra.length) {
    const fila = document.createElement("tr");
    const celda = document.createElement("td");
    celda.colSpan = 5;
    celda.className = "tabla-vacia";
    celda.textContent = "Agrega productos para preparar esta compra.";
    fila.appendChild(celda);
    body.appendChild(fila);
  }
  lineasCompra.forEach((item, index) => {
    const tr = document.createElement("tr");
    [
      item.nombre,
      item.cantidad,
      `$${item.costo.toLocaleString("es-CO")}`,
      `$${Math.round(item.costo * item.cantidad).toLocaleString("es-CO")}`,
    ].forEach(v => {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    });
    const td = document.createElement("td");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-eliminar";
    boton.textContent = "Quitar";
    boton.disabled = !!compraPendiente || productosGuardando;
    boton.addEventListener("click", () => {
      if (compraPendiente || productosGuardando) return;
      lineasCompra.splice(index, 1);
      renderLineasCompra();
    });
    td.appendChild(boton);
    tr.appendChild(td);
    body.appendChild(tr);
    [...tr.cells].forEach((td,i)=>td.dataset.label=['Producto','Cantidad','Costo','Subtotal','Acciones'][i]);
  });
  document.getElementById("compra-total").textContent = `$${Math.round(
    lineasCompra.reduce((sum, i) => sum + i.costo * i.cantidad, 0)
  ).toLocaleString("es-CO")}`;
}

function agregarLineaCompra() {
  if (
    !catalogoCargado ||
    compraPendiente ||
    productosGuardando ||
    ventaPendiente ||
    ventaAbiertaGuardadoPendiente
  )
    return;
  const producto = productos.find(
    p => p.id === document.getElementById("compra-producto").value
  );
  const cantidad = Number(document.getElementById("compra-cantidad").value);
  const costo = Number(document.getElementById("compra-costo").value);
  if (
    !producto ||
    !Number.isInteger(cantidad) ||
    cantidad <= 0 ||
    document.getElementById("compra-costo").value === "" ||
    !Number.isInteger(costo) ||
    costo < 0
  ) {
    mostrarNotificacion(
      "Selecciona un producto, cantidad entera positiva y costo no negativo.",
      "error"
    );
    return;
  }
  const existente = lineasCompra.find(i => i.productoId === producto.id);
  if (existente && existente.costo !== costo) {
    mostrarNotificacion(
      "Quita la línea anterior antes de cambiar el costo de ese producto.",
      "error"
    );
    return;
  }
  if (existente) existente.cantidad += cantidad;
  else
    lineasCompra.push({
      productoId: producto.id,
      nombre: producto.nombre,
      costo,
      cantidad,
    });
  renderLineasCompra();
}

async function registrarCompra(event) {
  event.preventDefault();
  if (
    !catalogoCargado ||
    productosGuardando ||
    ventaPendiente ||
    ventaAbiertaGuardadoPendiente ||
    gestiones.proveedores.guardando
  )
    return;

  const proveedorId = document.getElementById("compra-proveedor").value;
  if (!gestiones.proveedores.registros.some(p => p.id === proveedorId)) {
    mostrarNotificacion("Selecciona un proveedor válido.", "error");
    return;
  }
  if (!lineasCompra.length) {
    mostrarNotificacion("Agrega al menos un producto.", "error");
    return;
  }

  const compra = {
    id: crypto.randomUUID(),
    fecha: new Date().toISOString(),
    proveedorId,
    total: Math.round(
      lineasCompra.reduce((sum, i) => sum + i.costo * i.cantidad, 0)
    ),
    items: lineasCompra.map(i => ({ ...i })),
    itemsJson: lineasCompra.map(i => ({ ...i })),
  };

  const boton = document.getElementById("btn-registrar-compra");
  productosGuardando = true;
  document.getElementById("compra-form").setAttribute("aria-busy","true");
  document
    .querySelectorAll("#compra-form input, #compra-form select, #compra-form button")
    .forEach(e => (e.disabled = true));
  document.getElementById("compra-estado").textContent =
    "Registrando compra y actualizando inventario...";

  try {
    await apiPost("compras", "create", compra);
    compraPendiente = null;
    lineasCompra = [];
    document.getElementById("compra-form").reset();
    await cargarCatalogoRemoto();
    document.getElementById("compra-estado").textContent =
      "Compra e inventario confirmados.";
    document.getElementById("compra-form").removeAttribute("aria-busy"); cerrarFormularioModal("compra-form");
    mostrarNotificacion("Compra registrada correctamente.", "exito");
    cargarCompras(true);
  } catch (error) {
    document.getElementById("compra-estado").textContent =
      `Error al registrar compra: ${error.message}`;
    mostrarNotificacion(error.message, "error");
  } finally {
    productosGuardando = false;
    document.getElementById("compra-form").removeAttribute("aria-busy");
    document
      .querySelectorAll("#compra-form input, #compra-form select, #compra-form button")
      .forEach(e => (e.disabled = false));
    boton.disabled = false;
    boton.textContent = "Registrar compra";
    renderLineasCompra();
  }
}

async function cargarCompras(refrescarTrasCarga = false) {
  if (comprasEnCarga) {
    await comprasEnCarga;
    if (!refrescarTrasCarga) return;
  }
  const estado = document.getElementById("compras-lista-estado");
  estado.textContent = "";
  const quitarSkeleton = mostrarSkeleton(
    document.getElementById("compras-lista"),
    "tarjetas"
  );
  comprasEnCarga = (async () => {
    try {
      const compras = (await apiGet("compras")).map(c => ({
        ...c,
        total: Math.round(Number(c.total) || 0),
      }));
      comprasRegistradas=compras;
      renderListaCompras();
      estado.textContent = "";
    } catch (error) {
      estado.textContent = "No se pudieron cargar las compras.";
      mostrarNotificacion(error.message, "error");
    }
  })();
  try {
    await comprasEnCarga;
  } finally {
    quitarSkeleton();
    comprasEnCarga = null;
  }
}
let comprasRegistradas = [];
function renderListaCompras() {
  const q=document.getElementById('compras-buscar').value.trim().toLowerCase();
  const desde=document.getElementById('compras-fecha-desde').value, hasta=document.getElementById('compras-fecha-hasta').value;
  const tabla=tablaVista(['Compra','Fecha','Proveedor','Total','Detalle']);
  const lista=comprasRegistradas.filter(c=>(!desde || fechaLocal(c.fecha)>=desde) && (!hasta || fechaLocal(c.fecha)<=hasta) && (!q || [referenciaVisible(c.id,'CMP'),c.proveedorNombre || gestiones.proveedores.registros.find(p=>p.id===String(c.proveedorId))?.nombre || ''].some(t=>t.toLowerCase().includes(q))));
  paginarListado('compras', lista, JSON.stringify([q,desde,hasta]), document.getElementById('compras-lista'), renderListaCompras).forEach(c=>{
    const fila=tabla.tBodies[0].insertRow(); fila.dataset.compraId=c.id;
    celdaVista(fila,referenciaVisible(c.id,'CMP'));celdaVista(fila,fechaVista(c.fecha));
    celdaVista(fila,c.proveedorNombre || gestiones.proveedores.registros.find(p=>p.id===String(c.proveedorId))?.nombre);
    celdaVista(fila,dineroVista(c.total));filaConDetalle(fila,()=>abrirFichaCompra(c));
  });
  if(!lista.length){const td=tabla.tBodies[0].insertRow().insertCell();td.colSpan=5;td.className='tabla-vacia';td.textContent=desde && hasta && desde>hasta ? 'La fecha inicial debe ser anterior a la final.' : 'No hay compras que coincidan con los filtros.';}
  document.getElementById('compras-lista').replaceChildren(tabla);
}
function abrirFichaCompra(compra) {
  const proveedor=gestiones.proveedores.registros.find(p=>p.id===String(compra.proveedorId));
  const items=typeof compra.itemsJson==='string'?JSON.parse(compra.itemsJson):compra.items || compra.itemsJson || [];
  const tabla=tablaVista(['Producto','Cantidad','Costo unitario','Subtotal']);
  items.forEach(i=>{const fila=tabla.tBodies[0].insertRow();[i.nombre,i.cantidad,dineroVista(i.costo),dineroVista(i.costo*i.cantidad)].forEach(v=>celdaVista(fila,v));});
  const envoltura=document.createElement('div');envoltura.className='table-responsive';envoltura.append(tabla);
  abrirFicha('Compra '+referenciaVisible(compra.id,'CMP'),[datosFicha([['Proveedor',compra.proveedorNombre || proveedor?.nombre],['Documento / NIT',proveedor?.documento],['Contacto',[proveedor?.telefono,proveedor?.correo].filter(Boolean).join(' · ')],['Fecha',fechaVista(compra.fecha)]]),envoltura,datosFicha([['Total',dineroVista(compra.total)]])]);
}
