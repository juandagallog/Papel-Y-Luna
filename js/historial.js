function adaptarVentaRemota(venta) {
  let items = [];
  try {
    const raw = venta.items || venta.itemsJson || [];
    items = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("La venta " + venta.id + " contiene líneas inválidas.");
  }
  if (!Array.isArray(items)) {
    throw new Error("Las líneas de la venta deben ser una lista.");
  }
  const subtotal = Math.round(Number(venta.subtotal) || 0);
  const iva =
    venta.iva !== undefined
      ? Math.round(Number(venta.iva))
      : Math.round(subtotal * 0.19);
  const montoDescuento = Math.round(Number(venta.montoDescuento) || 0);
  const total =
    venta.total !== undefined
      ? Math.round(Number(venta.total))
      : Math.max(0, subtotal + iva - montoDescuento);
  const recibido = Math.round(Number(venta.valorRecibido) || 0);

  return {
    ...venta,
    items,
    subtotal,
    iva,
    montoDescuento,
    total,
    recibido,
    cambio:
      venta.metodoPago === "Efectivo"
        ? Math.max(0, total <= recibido ? recibido - total : 0)
        : 0,
    saldoPendiente: venta.metodoPago === "Debe" ? Math.max(0, total - recibido) : 0,
  };
}

let historialEnCarga = null;
let ventaParaReembolso = null;

async function renderHistorial(refrescarTrasCarga = false) {
  if (historialEnCarga) {
    await historialEnCarga;
    if (!refrescarTrasCarga) return;
  }
  historialEnCarga = cargarYRenderizarHistorial();
  try {
    await historialEnCarga;
  } finally {
    historialEnCarga = null;
  }
}

let ventasHistorial = [];
async function cargarYRenderizarHistorial() {
  const contenedor=document.getElementById('historial-container');
  const quitar=mostrarSkeleton(contenedor,'resumen-ventas');
  try {
    const datos=await apiGet('ventas');
    const validas=datos.map(adaptarVentaRemota);
    ventasHistorial=validas;
    renderTablaHistorial();
  } catch(error) { mostrarNotificacion('Error cargando historial: '+error.message,'error'); }
  finally {quitar();}
}
function renderTablaHistorial() {
  const tabla=tablaVista(['Factura','Fecha y hora','Cliente','Total','Estado','Detalle']);
  const q=document.getElementById('historial-buscar').value.trim().toLowerCase();
  const estado=document.getElementById('historial-estado').value;
  paginarListado('historial', ventasHistorial.filter(v=>(!estado || v.estado===estado) && (!q || [referenciaVisible(v.id,'VTA'),nombreCliente(v.clienteId)].some(t=>t.toLowerCase().includes(q)))), JSON.stringify([q,estado]), document.getElementById('historial-container'), renderTablaHistorial).forEach(v=>{
    const fila=tabla.tBodies[0].insertRow(); fila.dataset.ventaId=v.id;
    const ref=celdaVista(fila,referenciaVisible(v.id,'VTA'));
    if(v.corregida) ref.append(document.createElement('br'),insigniaEstado('bajo','Corregida'));
    if(v.tieneReembolsos) ref.append(document.createElement('br'),insigniaEstado('agotado','Con reembolso'));
    celdaVista(fila,fechaVista(v.fecha)); celdaVista(fila,nombreCliente(v.clienteId)); celdaVista(fila,dineroVista(v.total));
    const estadoCelda=fila.insertCell(); estadoCelda.dataset.label='Estado'; estadoCelda.append(insigniaEstado(v.estado==='abierta'?'bajo':'disponible',v.estado==='abierta'?'Abierta':'Cerrada'));
    filaConDetalle(fila,()=>abrirFicha('Venta '+referenciaVisible(v.id,'VTA'),[contenidoFichaVenta(v)]));
  });
  if(!tabla.tBodies[0].rows.length) {const td=tabla.tBodies[0].insertRow().insertCell(); td.colSpan=6; td.className='tabla-vacia'; td.textContent='No hay ventas que coincidan con los filtros.';}
  document.getElementById('historial-container').replaceChildren(tabla);
}
function contenidoFichaVenta(venta) {
  const esUsuarioAdmin=Boolean(window.usuarioActual?.esAdmin);
    const card = document.createElement("article");
    card.classList.add("historial-card", "venta-detalle");

    const cardHeader = document.createElement("div");
    cardHeader.classList.add("historial-card-header");
    const infoHeader = document.createElement("div");
    const idText = document.createElement("strong");
    idText.textContent = referenciaVisible(venta.id, "VTA");

    const fechaText = document.createElement("p");
    fechaText.classList.add("historial-card-fecha");
    const fObj = new Date(venta.fecha);
    fechaText.textContent = Number.isNaN(fObj.getTime())
      ? venta.fecha
      : fObj.toLocaleString("es-CO");
    infoHeader.appendChild(idText);
    infoHeader.appendChild(fechaText);

    // Etiquetas de estado: Corregida / Con reembolsos (Requisitos 3.4 y 3.5)
    if (venta.corregida) {
      const badgeCorr = document.createElement("small");
      const fCorr = venta.fechaCorreccion
        ? new Date(venta.fechaCorreccion).toLocaleString("es-CO")
        : "";
      badgeCorr.className = "historial-badge-correccion";
      badgeCorr.textContent = `Corregida por ${venta.corregidaPor || "Admin"} (${fCorr})`;
      infoHeader.appendChild(badgeCorr);
    }
    if (venta.tieneReembolsos) {
      const badgeReemb = document.createElement("small");
      badgeReemb.className = "historial-badge-reembolso";
      badgeReemb.textContent = `Con reembolso (-$${Number(venta.totalReembolsado || 0).toLocaleString("es-CO")})`;
      infoHeader.appendChild(badgeReemb);
    }

    const totalText = document.createElement("strong");
    totalText.textContent = `$${venta.total.toLocaleString("es-CO")}`;
    cardHeader.appendChild(infoHeader);
    cardHeader.appendChild(totalText);
    const indicacion = document.createElement('span'); indicacion.className = 'detalle-indicacion'; indicacion.textContent = 'Ver detalle';
    cardHeader.appendChild(indicacion);

    const cardBody = document.createElement("div");
    cardBody.classList.add("historial-card-body");
    const tituloDetalle = document.createElement("p");
    tituloDetalle.classList.add("historial-card-titulo-detalle");
    tituloDetalle.textContent = `Cliente: ${nombreCliente(venta.clienteId)} — Detalle de la compra:`;

    const lista = document.createElement("ul");
    lista.classList.add("historial-card-lista");
    venta.items.forEach(item => {
      const li = document.createElement("li");
      li.classList.add("historial-card-item");
      const spanNombre = document.createElement("span");
      spanNombre.textContent = `${item.nombre} (x${item.cantidad})`;
      const spanPrecio = document.createElement("span");
      spanPrecio.textContent = `$${Math.round(item.precio * item.cantidad).toLocaleString("es-CO")}`;
      li.appendChild(spanNombre);
      li.appendChild(spanPrecio);
      lista.appendChild(li);
    });
    const cliente = clientes.find(c => c.id === String(venta.clienteId));
    cardBody.append(datosFicha([['Estado',venta.estado],['Cliente',cliente?.nombre || nombreCliente(venta.clienteId)],['Documento',cliente?.documento],['Contacto',[cliente?.telefono,cliente?.correo].filter(Boolean).join(' · ')],['Dirección',cliente?.direccion]]));
    cardBody.appendChild(tituloDetalle);
    cardBody.appendChild(lista);

    const cardPago = document.createElement("div");
    cardPago.classList.add("historial-card-pago");

    if (venta.montoDescuento > 0) {
      const descText = document.createElement("p");
      descText.classList.add("historial-pago-info");
      descText.textContent = `Descuento (${venta.descuentoNombre || "Aplicado"}): -$${venta.montoDescuento.toLocaleString("es-CO")}`;
      cardPago.appendChild(descText);
    }

    const metodoText = document.createElement("p");
    metodoText.classList.add("historial-pago-info");
    metodoText.textContent = `Pago: ${venta.metodoPago || "Efectivo"}`;
    cardPago.appendChild(metodoText);

    if (venta.metodoPago === "Efectivo" || !venta.metodoPago) {
      const cambioText = document.createElement("p");
      cambioText.classList.add("historial-pago-info");
      cambioText.textContent = `Recibido: $${(venta.recibido || venta.total).toLocaleString("es-CO")} | Cambio: $${(venta.cambio || 0).toLocaleString("es-CO")}`;
      cardPago.appendChild(cambioText);
    }
    if (venta.metodoPago === "Debe") {
      const deudaText = document.createElement("p");
      deudaText.classList.add("historial-pago-info");
      deudaText.textContent = `Saldo pendiente: $${venta.saldoPendiente.toLocaleString("es-CO")}`;
      cardPago.appendChild(deudaText);
    }
    cardBody.append(datosFicha([['Subtotal',dineroVista(venta.subtotal)],['IVA',dineroVista(venta.iva)],['Total',dineroVista(venta.total)]]));
    cardBody.appendChild(cardPago);

    const cardFooter = document.createElement("div");
    cardFooter.classList.add("historial-card-footer");
    const btnImprimir = document.createElement("button");
    btnImprimir.type = "button";
    btnImprimir.classList.add("btn-imprimir-factura");
    btnImprimir.textContent = "Imprimir Factura";
    btnImprimir.addEventListener("click", () => {
      try {
        imprimirFactura(venta);
      } catch (error) {
        mostrarNotificacion(error.message, "error");
      }
    });
    if (venta.estado === 'cerrada') cardFooter.appendChild(btnImprimir);
    else {
      const retomar=document.createElement('button'); retomar.type='button'; retomar.className='btn-primary'; retomar.textContent='Retomar venta';
      retomar.addEventListener('click',async()=>{retomar.disabled=true; try { cerrarFicha(); await retomarVentaAbierta(venta.id); } finally {retomar.disabled=false;}}); cardFooter.append(retomar);
    }

    // Botones administrativos: Corregir y Reembolsar (Requisitos 3.4, 3.5 y 3.8)
    if (esUsuarioAdmin && venta.estado === "cerrada") {
      const btnCorregir = document.createElement("button");
      btnCorregir.type = "button";
      btnCorregir.className = "btn-editar";
      btnCorregir.textContent = "Corregir";
      btnCorregir.disabled = !!venta.tieneReembolsos;
      if (venta.tieneReembolsos) btnCorregir.title = 'No se puede corregir una venta con reembolsos.';
      btnCorregir.addEventListener("click", async () => {
        if (factura.length && !await confirmarAccion('Se reemplazará el carrito actual. ¿Continuar?', { titulo: 'Corregir venta', aceptar: 'Continuar' })) return;
        btnCorregir.disabled = true; btnCorregir.setAttribute('aria-busy', 'true');
        try {
          // Leer la versión actual evita reabrir snapshots anteriores a una corrección.
          const actual=adaptarVentaRemota(await apiGet(`ventas/${venta.id}`));
          cerrarFicha(); iniciarCorreccionVenta(actual);
        } catch (error) { mostrarNotificacion(error.message, 'error'); }
        finally { btnCorregir.disabled = !!venta.tieneReembolsos; btnCorregir.removeAttribute('aria-busy'); }
      });

      const btnReembolsar = document.createElement("button");
      btnReembolsar.type = "button";
      btnReembolsar.className = "btn-eliminar";
      btnReembolsar.textContent = "Reembolsar";
      btnReembolsar.addEventListener("click", () => { cerrarFicha(); abrirModalReembolso(venta); });

      cardFooter.append(btnCorregir, btnReembolsar);
    }

    card.appendChild(cardHeader);
    card.appendChild(cardBody);
    card.appendChild(cardFooter);
  return card;
}

// --- MODAL DE REEMBOLSOS (Requisito 3.5) ---
function abrirModalReembolso(venta) {
  ventaParaReembolso = venta;
  const modal = document.getElementById("reembolso-modal");
  const tbody = document.getElementById("reembolso-items-body");
  const info = document.getElementById("reembolso-venta-info");
  document.getElementById("reembolso-venta-id").value = venta.id;
  document.getElementById("reembolso-retorna-stock").checked = true;
  info.textContent = `Venta ${referenciaVisible(venta.id, "VTA")} — Total pagado: $${venta.total.toLocaleString("es-CO")}`;
  tbody.replaceChildren();

  // Calcular cuántas unidades ya se han reembolsado por producto
  const reembolsadosPorProd = {};
  (venta.reembolsos || []).forEach(r => {
    (r.items || []).forEach(it => {
      reembolsadosPorProd[it.productoId] =
        (reembolsadosPorProd[it.productoId] || 0) + Number(it.cantidad);
    });
  });

  venta.items.forEach(item => {
    const prev = reembolsadosPorProd[item.productoId] || 0;
    const disp = Math.max(0, Number(item.cantidad) - prev);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escaparHTML(item.nombre)}</td>
      <td>${item.cantidad} (Disp: ${disp})</td>
      <td>$${Number(item.precio).toLocaleString("es-CO")}</td>
      <td>
        <input type="number" class="reembolso-cant-input"
          data-producto-id="${escaparHTML(item.productoId)}"
          data-precio="${item.precio}"
          min="0" max="${disp}" value="0" ${disp === 0 ? "disabled" : ""}>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".reembolso-cant-input").forEach(inp => {
    inp.addEventListener("input", actualizarEstimadoReembolso);
  });
  actualizarEstimadoReembolso();
  modal.classList.remove("hidden");
}

function actualizarEstimadoReembolso() {
  if (!ventaParaReembolso) return;
  const factor =
    ventaParaReembolso.subtotal > 0
      ? ventaParaReembolso.total / ventaParaReembolso.subtotal
      : 0;
  let subtotalDevolver = 0;
  document.querySelectorAll(".reembolso-cant-input").forEach(inp => {
    const cant = Math.max(0, Number(inp.value) || 0);
    const precio = Number(inp.dataset.precio) || 0;
    subtotalDevolver += cant * precio;
  });
  const estimado = Math.round(subtotalDevolver * factor);
  document.getElementById("reembolso-total-estimado").textContent =
    `$${estimado.toLocaleString("es-CO")}`;
}

function cerrarModalReembolso() {
  ventaParaReembolso = null;
  document.getElementById("reembolso-modal").classList.add("hidden");
}

function imprimirFactura(venta) {
  if (venta.items === undefined) venta = adaptarVentaRemota(venta);
  const ventana = window.open("", "_blank", "width=400,height=650");
  if (!ventana) {
    throw new Error(
      "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes y reimprime desde el historial."
    );
  }

  const metodoPago = venta.metodoPago || "Efectivo";
  const recibido = venta.recibido ?? venta.total;
  const cambio = venta.cambio || 0;
  const filasItems = venta.items
    .map(
      i => `
    <div class="ticket-row">
      <span>${escaparHTML(i.nombre)} x${i.cantidad}</span>
      <span>$${Math.round(i.precio * i.cantidad).toLocaleString("es-CO")}</span>
    </div>
  `
    )
    .join("");

  const bloqueDescuento =
    venta.montoDescuento > 0
      ? `
    <div class="ticket-row">
      <span>Descuento (${escaparHTML(venta.descuentoNombre || "Aplicado")}):</span>
      <span>-$${venta.montoDescuento.toLocaleString("es-CO")}</span>
    </div>
  `
      : "";

  const bloqueCorregida = venta.corregida
    ? `<p class="ticket-meta"><strong>[VENTA CORREGIDA POR: ${escaparHTML(venta.corregidaPor || "Admin")} — ${new Date(venta.fechaCorreccion).toLocaleString("es-CO")}]</strong></p>`
    : "";

  const bloqueReembolso = venta.tieneReembolsos
    ? `<p class="ticket-meta"><strong>[CON REEMBOLSOS: -$${Number(venta.totalReembolsado || 0).toLocaleString("es-CO")}]</strong></p>`
    : "";

  let bloqueEfectivo = "";
  if (metodoPago === "Efectivo") {
    bloqueEfectivo = `
      <div class="ticket-row">
        <span>Recibido:</span>
        <span>$${recibido.toLocaleString("es-CO")}</span>
      </div>
      <div class="ticket-row">
        <span>Cambio:</span>
        <span>$${cambio.toLocaleString("es-CO")}</span>
      </div>
    `;
  }
  let bloqueDeuda = "";
  if (metodoPago === "Debe") {
    bloqueDeuda = `
      <div class="ticket-row">
        <span>Saldo pendiente:</span>
        <span>$${venta.saldoPendiente.toLocaleString("es-CO")}</span>
      </div>
    `;
  }

  ventana.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Factura - ${referenciaVisible(venta.id, "VTA")}</title>
        <link rel="stylesheet" href="css/Style.css">
      </head>
      <body class="ticket-body">
        <div class="ticket-wrapper">
          <h2 class="ticket-title">Papel y Luna</h2>
          <p class="ticket-meta">Referencia: ${referenciaVisible(venta.id, "VTA")}</p>
          <p class="ticket-meta">Fecha: ${new Date(venta.fecha).toLocaleString("es-CO")}</p>
          <p class="ticket-meta">Cliente: ${escaparHTML(nombreCliente(venta.clienteId))}</p>
          ${bloqueCorregida}
          ${bloqueReembolso}
          <div class="ticket-divider"></div>
          ${filasItems}
          <div class="ticket-divider"></div>
          <div class="ticket-row">
            <span>Subtotal:</span>
            <span>$${venta.subtotal.toLocaleString("es-CO")}</span>
          </div>
          <div class="ticket-row">
            <span>IVA (19%):</span>
            <span>$${venta.iva.toLocaleString("es-CO")}</span>
          </div>
          ${bloqueDescuento}
          <div class="ticket-row ticket-total">
            <span>TOTAL:</span>
            <span>$${venta.total.toLocaleString("es-CO")}</span>
          </div>
          <div class="ticket-divider"></div>
          <div class="ticket-row">
            <span>Método de Pago:</span>
            <span>${escaparHTML(metodoPago)}</span>
          </div>
          ${bloqueEfectivo}
          ${bloqueDeuda}
          <div class="ticket-actions">
            <button type="button" class="btn-imprimir-factura" onclick="window.print()">
              Imprimir Factura
            </button>
          </div>
        </div>
      </body>
    </html>
  `);
  ventana.document.close();
  ventana.focus();
}
