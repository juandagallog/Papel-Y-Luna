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

  document.body.dataset.rol = user?.esAdmin ? 'admin' : 'cajero';
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
  document.getElementById('btn-nav-inicio').click();
}

// =====================================================================
// GESTIÓN DE DESCUENTOS (Requisito 3.6 - Solo Admin)
// =====================================================================
async function cargarVistaDescuentos() {
  const quitar = mostrarSkeleton(document.getElementById('descuentos-body'), 'tabla', 5);
  try {
    const lista = await apiGet("descuentos");
    descuentosCatalogo = Array.isArray(lista)
      ? lista.map(d => ({
          id: String(d.id),
          nombre: String(d.nombre),
          tipo: String(d.tipo),
          valor: Number(d.valor),
          disponible: d.disponible !== false,
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
  tbody.closest('table').classList.add('tabla-fichas');
  const q = document.getElementById('descuentos-buscar').value.trim().toLowerCase(), estado = document.getElementById('descuentos-filtro').value;
  paginarListado('descuentos', descuentosCatalogo.filter(d => d.nombre.toLowerCase().includes(q) && (!estado || String(d.disponible) === estado)), JSON.stringify([q,estado]), tbody.closest('.table-responsive'), renderTablaDescuentos).forEach(d => {
    const tr = document.createElement("tr");
    const valorTexto =
      d.tipo === "porcentaje"
        ? `${d.valor}%`
        : `$${Number(d.valor).toLocaleString("es-CO")}`;
    tr.innerHTML = `
      <td>${escaparHTML(d.nombre)}</td>
      <td>${d.tipo === "porcentaje" ? "Porcentaje" : "Valor fijo"}</td>
      <td>${valorTexto}</td>
      <td><span class="estado-badge ${d.disponible ? 'estado-disponible' : 'estado-agotado'}">${d.disponible ? 'Disponible' : 'No disponible'}</span></td>
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
      document.getElementById('descuentos-disponible').value = String(d.disponible);
      abrirFormularioModal('descuentos-form', 'Editar descuento');
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
    [...tr.cells].forEach((td,i) => td.dataset.label=['Nombre','Tipo','Valor','Estado','Acciones'][i]);
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
    const payload = { id: id || crypto.randomUUID(), nombre, tipo, valor, disponible: document.getElementById('descuentos-disponible').value === 'true' };
    await apiPost("descuentos", id ? "update" : "create", payload);
    document.getElementById("descuentos-form").reset();
    document.getElementById("descuentos-id").value = "";
    await cargarVistaDescuentos();
    calcularTotales();
    mostrarNotificacion("Descuento guardado correctamente.", "exito");
    form.removeAttribute('aria-busy'); cerrarFormularioModal('descuentos-form');
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
let faltantesActuales = [];
async function cargarFaltantes() {
  const secuencia = ++secuenciaFaltantes;
  const quitar = mostrarSkeleton(document.getElementById('faltantes-table-body'), 'tabla', 7);
  actualizarSelectoresFaltantes();
  try {
    const lista = await apiGet('faltantes');
    if (secuencia !== secuenciaFaltantes) return;
    faltantesActuales = lista;
    renderFaltantes();
  } catch (error) { if (secuencia === secuenciaFaltantes) mostrarNotificacion(error.message, 'error'); }
  finally { quitar(); }
}
function renderFaltantes() {
  const q=document.getElementById('faltantes-buscar').value.trim().toLowerCase();
  const tipo=document.getElementById('filtro-faltante-tipo').value, proveedor=document.getElementById('filtro-faltante-proveedor').value, estado=document.getElementById('faltantes-estado').value;
  const body=document.getElementById('faltantes-table-body'); body.replaceChildren(); body.closest('table').classList.add('tabla-fichas');
  const lista=faltantesActuales.filter(f=>(!q || [f.productoNombre,f.descripcion].some(t=>String(t||'').toLowerCase().includes(q))) && (!tipo || f.tipo===tipo) && (!proveedor || String(f.proveedorId)===proveedor) && (!estado || f.estado===estado));
  paginarListado('faltantes',lista,JSON.stringify([q,tipo,proveedor,estado]),body.closest('.table-responsive'),renderFaltantes).forEach(f=>{
    const tr=body.insertRow(); celdaVista(tr,f.productoNombre||f.descripcion);
    tr.insertCell().append(insigniaEstado(f.tipo==='agotado'?'agotado':'neutro',f.tipo==='agotado'?'Agotado':'Inexistente'));
    celdaVista(tr,f.cantidadSolicitada);celdaVista(tr,f.proveedorNombre||'—');
    tr.insertCell().append(insigniaEstado(f.estado==='resuelto'?'disponible':'bajo',f.estado==='resuelto'?'Resuelto':'Pendiente'));
    celdaVista(tr,fechaVista(f.fecha));filaConDetalle(tr,()=>abrirDetalleFaltante(f));
    [...tr.cells].forEach((td,i)=>td.dataset.label=['Producto','Tipo','Cantidad','Proveedor','Estado','Fecha','Detalle'][i]);
  });
  if(!lista.length){const td=body.insertRow().insertCell();td.colSpan=7;td.textContent='No hay faltantes que coincidan con los filtros.';}
}
function abrirDetalleFaltante(f) {
  const acciones=f.estado==='pendiente'?[{texto:'Marcar como resuelto',ejecutar:async()=>{
    try {await apiPost('faltantes','update',{id:f.id,estado:'resuelto'});await cargarFaltantes();mostrarNotificacion('Faltante resuelto.','exito');}
    catch(error){mostrarNotificacion(error.message,'error');}
  }}]:[];
  abrirFicha(f.productoNombre||f.descripcion,[datosFicha([['Tipo',f.tipo==='agotado'?'Agotado':'Inexistente'],['Cantidad solicitada',f.cantidadSolicitada],['Proveedor',f.proveedorNombre],['Fecha',fechaVista(f.fecha)],['Estado',f.estado==='resuelto'?'Resuelto':'Pendiente'],['Notas',f.notas]])],acciones);
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
      notas: document.getElementById("faltante-notas").value.trim(),
    });
    document.getElementById("faltante-form").reset();
    document.getElementById('faltante-tipo').dispatchEvent(new Event('change'));
    await cargarFaltantes();
    form.removeAttribute('aria-busy'); cerrarFormularioModal('faltante-form');
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
  if (!window.usuarioActual?.esAdmin) return;
  const usuarioReporte = window.usuarioActual;
  const boton = document.querySelector('#reportes-form button[type="submit"]');
  if (boton.disabled) return;
  const inputIni = document.getElementById("reporte-fecha-inicio");
  const inputFin = document.getElementById("reporte-fecha-fin");
  const hoy = fechaNegocio();
  if (!inputIni.value) inputIni.value = hoy;
  if (!inputFin.value) inputFin.value = hoy;

  boton.disabled = true;
  const quitar = mostrarSkeleton(document.getElementById('reportes-resumen-cards'), 'tarjetas');
  try {
    const data = await apiGet("reportes", {
      fechaInicio: inputIni.value,
      fechaFin: inputFin.value,
    });

    if (window.usuarioActual !== usuarioReporte) return;
    renderResumenReporte(data);

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
    completarTablasReporte();
  } catch (error) {
    mostrarNotificacion(error.message, "error");
  } finally { quitar(); boton.disabled = false; }
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
  document.getElementById("filtro-faltante-tipo").addEventListener("change", renderFaltantes);
  document.getElementById("filtro-faltante-proveedor").addEventListener("change", renderFaltantes);

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
    "inicio",
    "reportes",
  ];

  function mostrarVista(nombreVista) {
    if (['proveedores','compras','categorias','descuentos','reportes'].includes(nombreVista) && !window.usuarioActual?.esAdmin) return;
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
    if (nombreVista === 'reportes') document.getElementById('btn-nav-inicio').classList.add('active');
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
  document.getElementById("btn-nav-inicio").addEventListener("click", () => {
    mostrarVista("inicio");
    cargarInicio();
  });
  document.getElementById('inicio-reportes').addEventListener('click', () => {
    if (!window.usuarioActual?.esAdmin) return;
    mostrarVista('reportes');
    consultarReportes();
  });
  document.getElementById('reportes-volver').addEventListener('click', () => document.getElementById('btn-nav-inicio').click());

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
