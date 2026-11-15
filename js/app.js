window.usuarioActual = null;

function mostrarModalLogin() {
  document.body.dataset.sesion = 'no';
  const modal = document.getElementById("login-modal");
  if (modal) abrirModalConFoco(modal, document.getElementById('login-username'));
}
window.mostrarModalLogin = mostrarModalLogin;

function ocultarModalLogin() {
  document.body.dataset.sesion = 'si';
  const modal = document.getElementById("login-modal");
  if (modal) modal.classList.add("hidden");
}

function aplicarPermisosInterfaz(user) {
  window.usuarioActual = user;
  const badge = document.getElementById("session-user-badge");
  if (badge) {
    badge.textContent = user
      ? `${user.nombre} (${user.rol === "ADMIN" ? "Administrador" : "Cajero"})`
      : "Sin sesión";
  }

  const esAdmin = Boolean(user && user.esAdmin);
  document.querySelectorAll(".admin-only").forEach(el => {
    if (esAdmin) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

async function inicializarDatosSistema() {
  await Promise.all([
    cargarCatalogoRemoto(),
    cargarClientes(),
    cargarGestion("proveedores").catch(() => {}),
  ]);
  actualizarSelectoresFaltantes();
}

// =====================================================================
// GESTIÓN DE DESCUENTOS (Requisito 3.6 - Solo Admin)
// =====================================================================
async function cargarVistaDescuentos() {
  const quitar = mostrarSkeleton(document.getElementById('descuentos-body'), 'tabla', 4);
  try {
    const lista = await apiGet("descuentos");
    descuentosCatalogo = Array.isArray(lista)
      ? lista.map(d => ({
          id: String(d.id),
          nombre: String(d.nombre),
          tipo: String(d.tipo),
          valor: Number(d.valor),
        }))
      : [];
    actualizarSelectDescuentosPOS();
    renderTablaDescuentos();
  } catch (error) {
    mostrarNotificacion(error.message, "error");
  } finally { quitar(); }
}

function renderTablaDescuentos() {
  const tbody = document.getElementById("descuentos-body");
  if (!tbody) return;
  tbody.replaceChildren();
  descuentosCatalogo.forEach(d => {
    const tr = document.createElement("tr");
    const valorTexto =
      d.tipo === "porcentaje"
        ? `${d.valor}%`
        : `$${Number(d.valor).toLocaleString("es-CO")}`;
    tr.innerHTML = `
      <td>${escaparHTML(d.nombre)}</td>
      <td>${d.tipo === "porcentaje" ? "Porcentaje" : "Valor fijo"}</td>
      <td>${valorTexto}</td>
      <td>
        <button type="button" class="btn-editar" data-id="${escaparHTML(d.id)}">Editar</button>
        <button type="button" class="btn-eliminar" data-id="${escaparHTML(d.id)}">Eliminar</button>
      </td>
    `;
    tr.querySelector(".btn-editar").addEventListener("click", () => {
      document.getElementById("descuentos-id").value = d.id;
      document.getElementById("descuentos-nombre").value = d.nombre;
      document.getElementById("descuentos-tipo").value = d.tipo;
      document.getElementById("descuentos-valor").value = d.valor;
    });
    tr.querySelector(".btn-eliminar").addEventListener("click", async () => {
      if (!await confirmarAccion(`¿Eliminar el descuento "${d.nombre}"?`, { titulo: 'Eliminar descuento', aceptar: 'Eliminar', peligrosa: true })) return;
      try {
        await apiPost("descuentos", "delete", { id: d.id });
        await cargarVistaDescuentos();
        calcularTotales();
        mostrarNotificacion("Descuento eliminado.", "exito");
      } catch (error) {
        mostrarNotificacion(error.message, "error");
      }
    });
    tbody.appendChild(tr);
  });
}

async function guardarDescuento(event) {
  event.preventDefault();
  const form = document.getElementById('descuentos-form');
  if (form.getAttribute('aria-busy') === 'true') return;
  const id = document.getElementById("descuentos-id").value.trim();
  const nombre = document.getElementById("descuentos-nombre").value.trim();
  const tipo = document.getElementById("descuentos-tipo").value;
  const valor = Number(document.getElementById("descuentos-valor").value);

  if (!nombre || !Number.isInteger(valor) || valor <= 0) {
    mostrarNotificacion("Ingresa un nombre y un valor entero positivo.", "error");
    return;
  }
  form.setAttribute('aria-busy', 'true');
  form.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const payload = { id: id || crypto.randomUUID(), nombre, tipo, valor };
    await apiPost("descuentos", id ? "update" : "create", payload);
    document.getElementById("descuentos-form").reset();
    document.getElementById("descuentos-id").value = "";
    await cargarVistaDescuentos();
    calcularTotales();
    mostrarNotificacion("Descuento guardado correctamente.", "exito");
  } catch (error) {
    mostrarNotificacion(error.message, "error");
  } finally { form.removeAttribute('aria-busy'); form.querySelectorAll('button').forEach(b => b.disabled = false); }
}

// =====================================================================
// GESTIÓN DE FALTANTES (Requisito 3.7)
// =====================================================================
function actualizarSelectoresFaltantes() {
  const selProd = document.getElementById("faltante-producto");
  const selProv = document.getElementById("faltante-proveedor");
  const filProv = document.getElementById("filtro-faltante-proveedor");
  if (selProd) {
    const actual = selProd.value;
    selProd.replaceChildren(new Option("Selecciona un producto...", ""));
    productos.forEach(p => selProd.add(new Option(`${p.nombre} (Stock: ${p.stock})`, p.id)));
    selProd.value = actual;
  }
  if (selProv) {
    const actual = selProv.value;
    selProv.replaceChildren(new Option("Sin proveedor", ""));
    gestiones.proveedores.registros.forEach(pr =>
      selProv.add(new Option(pr.nombre, pr.id))
    );
    selProv.value = actual;
  }
  if (filProv) {
    const val = filProv.value;
    filProv.replaceChildren(new Option("Todos los proveedores", ""));
    gestiones.proveedores.registros.forEach(pr =>
      filProv.add(new Option(pr.nombre, pr.id))
    );
    filProv.value = val;
  }
}

let secuenciaFaltantes = 0;
async function cargarFaltantes() {
  const secuencia = ++secuenciaFaltantes;
  const quitarAgrupados = mostrarSkeleton(document.getElementById('faltantes-agrupados-body'), 'tabla', 5);
  const quitarLista = mostrarSkeleton(document.getElementById('faltantes-table-body'), 'tabla', 7);
  actualizarSelectoresFaltantes();
  const tipo = document.getElementById("filtro-faltante-tipo").value;
  const proveedorId = document.getElementById("filtro-faltante-proveedor").value;

  try {
    const [lista, agrupados] = await Promise.all([
      apiGet("faltantes", { tipo, proveedorId }),
      apiGet("faltantes/agrupados", { tipo, proveedorId }),
    ]);
    if (secuencia !== secuenciaFaltantes) return;

    const bodyAgrupados = document.getElementById("faltantes-agrupados-body");
    bodyAgrupados.replaceChildren();
    agrupados.forEach(g => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong title="Agrupado como: ${escaparHTML(g.nombreNormalizado)}">${escaparHTML(g.descripcionReferencia)}</strong></td>
        <td>${g.tipo === 'agotado' ? 'Agotado' : 'No registrado'}</td>
        <td>${escaparHTML(g.proveedorNombre)}</td>
        <td>${g.numeroSolicitudes}</td>
        <td><strong>${g.cantidadTotalSolicitada} un.</strong></td>
      `;
      tr.querySelectorAll('td').forEach((td, i) => td.dataset.label = ['Producto', 'Tipo', 'Proveedor', 'Solicitudes', 'Cantidad total'][i]);
      bodyAgrupados.appendChild(tr);
    });

    const bodyLista = document.getElementById("faltantes-table-body");
    bodyLista.replaceChildren();
    lista.forEach(f => {
      const tr = document.createElement("tr");
      const fecha = new Date(f.fecha).toLocaleString("es-CO");
      tr.innerHTML = `
        <td>${fecha}</td>
        <td>${escaparHTML(f.productoNombre || f.descripcion)}</td>
        <td>${escaparHTML(f.tipo)}</td>
        <td>${f.cantidadSolicitada}</td>
        <td>${escaparHTML(f.proveedorNombre)}</td>
        <td><strong>${escaparHTML(f.estado)}</strong></td>
        <td></td>
      `;
      tr.querySelectorAll('td').forEach((td, i) => td.dataset.label = ['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Proveedor', 'Estado', 'Acción'][i]);
      const tdAccion = tr.lastElementChild;
      if (f.estado === "pendiente") {
        const btnResolver = document.createElement("button");
        btnResolver.type = "button";
        btnResolver.className = "btn-primary";
        btnResolver.textContent = "Marcar resuelto";
        btnResolver.addEventListener("click", async () => {
          if (btnResolver.disabled) return;
          btnResolver.disabled = true; btnResolver.setAttribute('aria-busy', 'true');
          try {
            await apiPost("faltantes", "update", { id: f.id, estado: "resuelto" });
            await cargarFaltantes();
            mostrarNotificacion("Faltante marcado como resuelto.", "exito");
          } catch (error) {
            mostrarNotificacion(error.message, "error");
          } finally { btnResolver.disabled = false; btnResolver.removeAttribute('aria-busy'); }
        });
        tdAccion.appendChild(btnResolver);
      }
      bodyLista.appendChild(tr);
    });
  } catch (error) {
    if (secuencia === secuenciaFaltantes) mostrarNotificacion(error.message, "error");
  } finally { quitarAgrupados(); quitarLista(); }
}

async function registrarFaltante(event) {
  event.preventDefault();
  const form = document.getElementById('faltante-form');
  if (form.getAttribute('aria-busy') === 'true') return;
  const tipo = document.getElementById("faltante-tipo").value;
  const productoId = document.getElementById("faltante-producto").value;
  const descripcionInput = document.getElementById("faltante-descripcion").value.trim();
  const cantidadSolicitada = Number(document.getElementById("faltante-cantidad").value);
  const proveedorId = document.getElementById("faltante-proveedor").value;

  const prod = productos.find(p => p.id === productoId);
  const descripcion =
    tipo === "agotado" && prod ? prod.nombre : descripcionInput;

  if (!descripcion) {
    mostrarNotificacion("Selecciona un producto o escribe la descripción del faltante.", "error");
    return;
  }
  if (!Number.isInteger(cantidadSolicitada) || cantidadSolicitada <= 0) {
    mostrarNotificacion('La cantidad solicitada debe ser un entero positivo.', 'error'); return;
  }
  form.setAttribute('aria-busy', 'true');
  form.querySelector('button[type="submit"]').disabled = true;

  try {
    await apiPost("faltantes", "create", {
      tipo,
      productoId: tipo === "agotado" ? productoId : null,
      descripcion,
      cantidadSolicitada,
      proveedorId: proveedorId || null,
    });
    document.getElementById("faltante-form").reset();
    document.getElementById('faltante-tipo').dispatchEvent(new Event('change'));
    await cargarFaltantes();
    mostrarNotificacion("Faltante registrado correctamente.", "exito");
  } catch (error) {
    mostrarNotificacion(error.message, "error");
  } finally { form.removeAttribute('aria-busy'); form.querySelector('button[type="submit"]').disabled = false; }
}

// =====================================================================
// REPORTES BÁSICOS (Requisito 3.10 - Solo Admin)
// =====================================================================
async function consultarReportes(event) {
  if (event) event.preventDefault();
  const inputIni = document.getElementById("reporte-fecha-inicio");
  const inputFin = document.getElementById("reporte-fecha-fin");
  const hoy = new Date().toISOString().slice(0, 10);
  if (!inputIni.value) inputIni.value = hoy;
  if (!inputFin.value) inputFin.value = hoy;

  const quitar = mostrarSkeleton(document.getElementById('reportes-resumen-cards'), 'tarjetas');
  try {
    const data = await apiGet("reportes", {
      fechaInicio: inputIni.value,
      fechaFin: inputFin.value,
    });

    const cards = document.getElementById("reportes-resumen-cards");
    cards.innerHTML = `
      <article class="historial-card">
        <strong>Ventas Cerradas (${data.rango.fechaInicio} a ${data.rango.fechaFin}):</strong> ${data.ventasTotales.cantidadVentas}<br>
        <strong>Total Facturado:</strong> $${Number(data.ventasTotales.totalFacturado).toLocaleString("es-CO")}<br>
        <strong>Reembolsos:</strong> -$${Number(data.ventasTotales.totalReembolsado).toLocaleString("es-CO")}<br>
        <strong>Ventas Netas:</strong> $${Number(data.ventasTotales.ventasNetas).toLocaleString("es-CO")}
      </article>
      <article class="historial-card">
        <strong>Compras Registradas:</strong> ${data.comprasRegistradas.cantidadCompras}<br>
        <strong>Monto Total Compras:</strong> $${Number(data.comprasRegistradas.montoTotalCompras).toLocaleString("es-CO")}
      </article>
    `;

    const bodyVendidos = document.getElementById("reporte-mas-vendidos-body");
    bodyVendidos.replaceChildren();
    (data.productosMasVendidos || []).forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escaparHTML(p.nombre_historico)}</td>
        <td>${p.unidadesVendidas}</td>
        <td>$${Number(p.ingresosLinea).toLocaleString("es-CO")}</td>
      `;
      bodyVendidos.appendChild(tr);
    });

    const bodyCompras = document.getElementById("reporte-compras-body");
    bodyCompras.replaceChildren();
    (data.comprasRegistradas.listado || []).forEach(c => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${referenciaVisible(c.id, "CMP")}</td>
        <td>${new Date(c.fecha).toLocaleString("es-CO")}</td>
        <td>${escaparHTML(c.proveedorNombre)}</td>
        <td>$${Number(c.total).toLocaleString("es-CO")}</td>
      `;
      bodyCompras.appendChild(tr);
    });

    const bodyFaltantes = document.getElementById("reporte-faltantes-body");
    bodyFaltantes.replaceChildren();
    (data.faltantesFrecuentes || []).forEach(f => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escaparHTML(f.nombre_normalizado)}</td>
        <td>${escaparHTML(f.tipo)}</td>
        <td>${f.vecesReportado}</td>
        <td>${f.unidadesSolicitadas}</td>
      `;
      bodyFaltantes.appendChild(tr);
    });
  } catch (error) {
    mostrarNotificacion(error.message, "error");
  } finally { quitar(); }
}

// =====================================================================
// INICIALIZACIÓN PRINCIPAL DOMContentLoaded
// =====================================================================
document.addEventListener("DOMContentLoaded", async () => {
  abrirFormularioModal('cliente-form', 'Clientes', false, false);
  abrirFormularioModal('proveedores-form', 'Proveedores', false, false);
  document.getElementById('btn-nuevo-cliente-pos').addEventListener('click', () => abrirClienteModal(null, true));
  document.getElementById('btn-nuevo-cliente').addEventListener('click', () => abrirClienteModal());
  document.getElementById('btn-nuevo-proveedor').addEventListener('click', () => abrirFormularioModal('proveedores-form', 'Nuevo proveedor', true));
  document.getElementById('btn-nuevo-producto-pos').addEventListener('click', () => openProductModal(null, productos, false, false, true));
  document.getElementById('btn-descuento-puntual').addEventListener('click', () => {
    if (!window.usuarioActual?.esAdmin) return;
    abrirModalConFoco(document.getElementById('puntual-modal'), document.getElementById('puntual-valor'));
  });
  document.getElementById('puntual-form').addEventListener('submit', guardarDescuentoPuntual);
  document.getElementById('btn-cerrar-puntual').addEventListener('click', () => document.getElementById('puntual-modal').classList.add('hidden'));
  document.getElementById('btn-cancelar-puntual').addEventListener('click', () => document.getElementById('puntual-modal').classList.add('hidden'));
  const actualizarFaltanteTipo = () => {
    const agotado = document.getElementById('faltante-tipo').value === 'agotado';
    document.getElementById('grupo-faltante-producto').hidden = !agotado;
    document.getElementById('grupo-faltante-descripcion').hidden = agotado;
    document.getElementById('faltante-producto').required = agotado;
    document.getElementById('faltante-descripcion').required = !agotado;
  };
  document.getElementById('faltante-tipo').addEventListener('change', actualizarFaltanteTipo);
  actualizarFaltanteTipo();
  // Enter en el importe mueve el foco; nunca cierra una venta accidentalmente.
  document.getElementById('monto-recibido').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); document.getElementById('btn-finalizar').focus(); }
  });
  // Eventos de Login y Logout
  document.getElementById("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const errEl = document.getElementById("login-error");
    errEl.textContent = "";
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const boton = document.getElementById('btn-login-submit');
    if (boton.disabled) return;
    boton.disabled = true; boton.textContent = 'Ingresando…';
    document.getElementById('login-form').setAttribute('aria-busy', 'true');
    try {
      const res = await apiAuthLogin(username, password);
      ocultarModalLogin();
      aplicarPermisosInterfaz(res.user);
      document.getElementById("login-form").reset();
      document.getElementById("btn-nav-pos").click();
      await inicializarDatosSistema();
      mostrarNotificacion(`Bienvenido, ${res.user.nombre}`, "exito");
    } catch (error) {
      errEl.textContent = error.message;
      document.getElementById('login-password').focus();
    } finally {
      boton.disabled = false; boton.textContent = 'Ingresar';
      document.getElementById('login-form').removeAttribute('aria-busy');
    }
  });

  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (productosGuardando || compraPendiente || ventaPendiente || ventaAbiertaGuardadoPendiente) {
      mostrarNotificacion('Termina la operación en curso antes de salir.', 'advertencia'); return;
    }
    if (factura.length && !await confirmarAccion('Hay una venta en curso. Saldrás de la sesión sin finalizarla.', { titulo: 'Cerrar sesión', aceptar: 'Salir' })) return;
    const boton = document.getElementById('btn-logout'); boton.disabled = true;
    try {
      guardarBorradorVenta();
      await apiAuthLogout();
      restaurandoBorrador = true;
      factura = []; ventaEnCorreccion = null; ventaAbiertaActualId = null;
      descuentoPuntualActual = null; document.getElementById('select-descuento').value = '';
      renderizarFactura(); restaurandoBorrador = false; borradorPreparado = false;
      aplicarPermisosInterfaz(null);
      mostrarModalLogin();
      mostrarNotificacion('Sesión cerrada correctamente.', 'exito');
    } catch (error) { mostrarNotificacion('No se pudo cerrar la sesión: ' + error.message, 'error'); }
    finally { boton.disabled = false; }
  });

  // Eventos de Reembolso Modal
  document.getElementById("btn-cerrar-reembolso").addEventListener("click", cerrarModalReembolso);
  document.getElementById("btn-cancelar-reembolso").addEventListener("click", cerrarModalReembolso);
  document.getElementById("reembolso-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = document.getElementById('reembolso-form');
    if (form.getAttribute('aria-busy') === 'true') return;
    const ventaId = document.getElementById("reembolso-venta-id").value;
    const retornaInventario = document.getElementById("reembolso-retorna-stock").checked;
    const items = [];
    document.querySelectorAll(".reembolso-cant-input").forEach(inp => {
      const cantidad = Math.round(Number(inp.value) || 0);
      if (cantidad > 0) {
        items.push({ productoId: inp.dataset.productoId, cantidad, retornaInventario });
      }
    });
    if (!items.length) {
      mostrarNotificacion("Ingresa al menos 1 unidad a reembolsar.", "error");
      return;
    }
    const controles = [...document.querySelectorAll('#reembolso-modal button, #reembolso-modal input')].map(control => [control, control.disabled]);
    form.setAttribute('aria-busy', 'true'); controles.forEach(([control]) => control.disabled = true);
    try {
      await apiRegistrarReembolso(ventaId, { retornaInventario, items });
      cerrarModalReembolso();
      await cargarCatalogoRemoto();
      await renderHistorial(true);
      mostrarNotificacion("Reembolso registrado correctamente.", "exito");
    } catch (error) {
      mostrarNotificacion(error.message, "error");
    } finally { form.removeAttribute('aria-busy'); controles.forEach(([control, disabled]) => control.disabled = disabled); }
  });

  // Eventos de Proveedores y Categorías
  for (const resource of ["proveedores", "categorias"]) {
    document
      .getElementById(`${resource}-form`)
      .addEventListener("submit", e => guardarGestion(resource, e));
    document
      .getElementById(`${resource}-buscar`)
      .addEventListener("input", () => renderGestion(resource));
    document
      .getElementById(`${resource}-recargar`)
      .addEventListener("click", () => cargarGestion(resource));
    document
      .getElementById(`${resource}-cancelar`)
      .addEventListener("click", () => {
        if (gestiones[resource].guardando) return;
        document.getElementById(`${resource}-form`).reset();
        document.getElementById(`${resource}-id`).value = "";
      });
  }

  // Eventos de Descuentos, Faltantes y Reportes
  document.getElementById("descuentos-form").addEventListener("submit", guardarDescuento);
  document.getElementById("descuentos-recargar").addEventListener("click", cargarVistaDescuentos);
  document.getElementById("descuentos-cancelar").addEventListener("click", () => {
    document.getElementById("descuentos-form").reset();
    document.getElementById("descuentos-id").value = "";
  });

  document.getElementById("faltante-form").addEventListener("submit", registrarFaltante);
  document.getElementById("btn-recargar-faltantes").addEventListener("click", cargarFaltantes);
  document.getElementById("filtro-faltante-tipo").addEventListener("change", cargarFaltantes);
  document.getElementById("filtro-faltante-proveedor").addEventListener("change", cargarFaltantes);

  document.getElementById("reportes-form").addEventListener("submit", consultarReportes);

  // Eventos de Compras, Clientes y Productos existentes
  document.getElementById("compra-form").addEventListener("submit", registrarCompra);
  document.getElementById("btn-agregar-compra").addEventListener("click", agregarLineaCompra);
  document
    .getElementById("btn-nuevo-proveedor-compra")
    .addEventListener("click", abrirProveedorDesdeCompra);
  document
    .getElementById("nuevo-proveedor-form")
    .addEventListener("submit", e => guardarGestion("proveedores", e, true));
  document
    .getElementById("btn-cerrar-nuevo-proveedor")
    .addEventListener("click", cerrarProveedorDesdeCompra);
  document
    .getElementById("btn-cancelar-nuevo-proveedor")
    .addEventListener("click", cerrarProveedorDesdeCompra);
  document
    .getElementById("btn-nuevo-producto-compra")
    .addEventListener("click", () => openProductModal(null, productos, false, true));
  document.getElementById("btn-recargar-compras").addEventListener("click", cargarCompras);
  document.getElementById("compra-producto").addEventListener("change", () => {
    const producto = productos.find(
      p => p.id === document.getElementById("compra-producto").value
    );
    document.getElementById("compra-costo").value = producto ? producto.costo : "";
  });
  document.getElementById("btn-guardar-abierta").addEventListener("click", guardarVentaAbierta);
  document.getElementById("cliente-form").addEventListener("submit", guardarCliente);
  document.getElementById("buscar-cliente").addEventListener("input", renderClientes);
  document.getElementById("btn-recargar-clientes").addEventListener("click", cargarClientes);
  document.getElementById("btn-cancelar-cliente").addEventListener("click", () => {
    if (clienteGuardando) return;
    document.getElementById("cliente-form").reset();
    document.getElementById("cliente-id").value = "";
  });
  document
    .getElementById("btn-reintentar-catalogo")
    .addEventListener("click", cargarCatalogoRemoto);

  // Navegación entre las 10 vistas
  const todasLasVistas = [
    "pos",
    "productos",
    "historial",
    "clientes",
    "proveedores",
    "compras",
    "categorias",
    "descuentos",
    "faltantes",
    "reportes",
  ];

  function mostrarVista(nombreVista) {
    todasLasVistas.forEach(v => {
      const sec = document.getElementById(`vista-${v}`);
      const btn = document.getElementById(`btn-nav-${v}`);
      if (sec) sec.classList.add("vista-oculta");
      if (btn) btn.classList.remove("active");
    });
    const activaSec = document.getElementById(`vista-${nombreVista}`);
    const activoBtn = document.getElementById(`btn-nav-${nombreVista}`);
    if (activaSec) activaSec.classList.remove("vista-oculta");
    if (activoBtn) activoBtn.classList.add("active");
  }

  document.getElementById("btn-nav-pos").addEventListener("click", () => mostrarVista("pos"));
  document.getElementById("btn-nav-productos").addEventListener("click", () => {
    mostrarVista("productos");
    if (catalogoCargado) renderTablaCRUD(productos);
  });
  document.getElementById("btn-nav-historial").addEventListener("click", () => {
    mostrarVista("historial");
    renderHistorial();
  });
  document.getElementById("btn-nav-clientes").addEventListener("click", () => {
    mostrarVista("clientes");
    if (!clientesCargados) cargarClientes();
    else renderClientes();
  });
  for (const resource of ["proveedores", "categorias"]) {
    document.getElementById(`btn-nav-${resource}`).addEventListener("click", () => {
      mostrarVista(resource);
      cargarGestion(resource);
    });
  }
  document.getElementById("btn-nav-compras").addEventListener("click", async () => {
    mostrarVista("compras");
    actualizarProductosCompra();
    renderLineasCompra();
    await cargarGestion("proveedores");
    cargarCompras();
  });
  document.getElementById("btn-nav-descuentos").addEventListener("click", () => {
    mostrarVista("descuentos");
    cargarVistaDescuentos();
  });
  document.getElementById("btn-nav-faltantes").addEventListener("click", () => {
    mostrarVista("faltantes");
    cargarFaltantes();
  });
  document.getElementById("btn-nav-reportes").addEventListener("click", () => {
    mostrarVista("reportes");
    consultarReportes();
  });

  // Eventos para Modales y CRUD de Productos
  document.querySelector("#btn-new-product").addEventListener("click", () => {
    openProductModal(null, productos);
  });
  document.getElementById("product-form").addEventListener("submit", e => {
    handleFormSubmit(e, productos);
  });
  document.getElementById("confirm-delete-btn").addEventListener("click", async () => {
    const id = getProductoAEliminarId();
    if (
      !id ||
      productosGuardando ||
      ventaPendiente ||
      ventaAbiertaGuardadoPendiente ||
      compraPendiente
    )
      return;
    if (factura.some(item => item.id === id)) {
      mostrarNotificacion("No puedes eliminar un producto en la venta actual", "error");
      closeDeleteModal();
      return;
    }
    const botones = [
      "confirm-delete-btn",
      "btn-close-delete-modal",
      "btn-cancel-delete-modal",
    ].map(i => document.getElementById(i));
    productosGuardando = true;
    botones.forEach(b => (b.disabled = true));
    try {
      await apiPost("productos", "delete", { id });
      productos = productos.filter(p => p.id !== id);
      renderTablaCRUD(productos);
      renderizarProductos(obtenerProductosActuales());
      closeDeleteModal();
      mostrarNotificacion("Producto eliminado", "exito");
    } catch (error) {
      mostrarNotificacion(error.message, "error");
    } finally {
      productosGuardando = false;
      botones.forEach(b => (b.disabled = false));
    }
  });

  document.getElementById("btn-close-product-modal").addEventListener("click", closeProductModal);
  document.getElementById("btn-cancel-product-modal").addEventListener("click", closeProductModal);
  document.getElementById("btn-close-delete-modal").addEventListener("click", closeDeleteModal);
  document.getElementById("btn-cancel-delete-modal").addEventListener("click", closeDeleteModal);
  document.getElementById("track-inventory").addEventListener("change", toggleStockField);

  // Verificar sesión activa al cargar la página
  try {
    const sesion = await apiAuthSession();
    if (sesion && sesion.authenticated) {
      ocultarModalLogin();
      aplicarPermisosInterfaz(sesion.user);
      await inicializarDatosSistema();
    } else {
      mostrarModalLogin();
    }
  } catch {
    mostrarModalLogin();
  }
});

let temporizadorNotificacion;
function mostrarNotificacion(mensaje, tipo) {
  const notificacion = document.querySelector("#notificacion");
  notificacion.textContent = mensaje;
  notificacion.classList.remove("hidden");
  notificacion.classList.remove("error");
  notificacion.classList.remove("exito");
  notificacion.classList.remove('advertencia', 'informacion');
  notificacion.classList.add(tipo);
  const titulos = { exito: 'Listo', error: 'No se pudo completar', advertencia: 'Atención', informacion: 'Información' };
  notificacion.textContent = `${titulos[tipo] || 'Información'}: ${mensaje}`;
  clearTimeout(temporizadorNotificacion);
  temporizadorNotificacion = setTimeout(
    () => {
      notificacion.classList.add("hidden");
    },
    tipo === "error" ? 9000 : 5000
  );
}
