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
    mostrarNotificacion("Compra registrada correctamente.", "exito");
    cargarCompras(true);
  } catch (error) {
    document.getElementById("compra-estado").textContent =
      `Error al registrar compra: ${error.message}`;
    mostrarNotificacion(error.message, "error");
  } finally {
    productosGuardando = false;
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
      const fragment = document.createDocumentFragment();
      if (!compras.length) {
        const p = document.createElement("p");
        p.textContent = "No hay compras registradas.";
        fragment.appendChild(p);
      }
      compras.forEach(compra => {
        const items =
          typeof compra.itemsJson === "string"
            ? JSON.parse(compra.itemsJson)
            : compra.items || compra.itemsJson || [];
        const card = document.createElement("details");
        card.className = "historial-card compra-detalle";
        const summary = document.createElement("summary");
        const proveedor = gestiones.proveedores.registros.find(
          p => p.id === String(compra.proveedorId)
        );
        const titulo = document.createElement("strong");
        titulo.textContent = referenciaVisible(compra.id, "CMP");
        const importe = document.createElement("strong");
        importe.textContent = `$${Math.round(Number(compra.total)).toLocaleString("es-CO")}`;
        const accion = document.createElement("span");
        accion.className = "detalle-indicacion";
        accion.textContent = "Ver detalle";
        summary.append(titulo, importe, accion);
        card.appendChild(summary);

        const informacion = document.createElement("dl");
        informacion.className = "compra-datos";
        const fecha = new Date(compra.fecha);
        const datos = [
          [
            "Proveedor",
            compra.proveedorNombre ||
              proveedor?.nombre ||
              "Proveedor no disponible",
          ],
          [
            "Fecha",
            Number.isNaN(fecha.getTime())
              ? compra.fecha
              : fecha.toLocaleString("es-CO"),
          ],
          [
            "Ítems comprados",
            items.map(i => `${i.nombre} (×${i.cantidad})`).join(", "),
          ],
        ];
        datos.forEach(([etiqueta, valor]) => {
          const grupo = document.createElement("div");
          const dt = document.createElement("dt");
          const dd = document.createElement("dd");
          dt.textContent = etiqueta;
          dd.textContent = valor;
          grupo.append(dt, dd);
          informacion.appendChild(grupo);
        });
        summary.appendChild(informacion);

        const tabla = document.createElement("table");
        tabla.className = "crud-table";
        const thead = document.createElement("thead");
        const encabezado = document.createElement("tr");
        ["Producto", "Cantidad", "Costo unitario", "Subtotal"].forEach(texto => {
          const th = document.createElement("th");
          th.textContent = texto;
          th.scope = "col";
          encabezado.appendChild(th);
        });
        thead.appendChild(encabezado);
        tabla.appendChild(thead);
        const tbody = document.createElement("tbody");
        items.forEach(i => {
          const tr = document.createElement("tr");
          [
            i.nombre,
            i.cantidad,
            `$${Math.round(Number(i.costo)).toLocaleString("es-CO")}`,
            `$${Math.round(Number(i.costo) * Number(i.cantidad)).toLocaleString("es-CO")}`,
          ].forEach(valor => {
            const td = document.createElement("td");
            td.textContent = valor;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        tabla.appendChild(tbody);
        const responsive = document.createElement("div");
        responsive.className = "table-responsive";
        responsive.appendChild(tabla);
        card.appendChild(responsive);
        fragment.appendChild(card);
      });
      document.getElementById("compras-lista").replaceChildren(fragment);
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