let clientes = [];
let clientesCargados = false;
let clientesEnCarga = null;
let clienteGuardando = false;
let clienteDesdePOS = false;

function abrirClienteModal(cliente = null, desdePOS = false) {
  if (clienteGuardando || clientesEnCarga) return;
  clienteDesdePOS = desdePOS;
  abrirFormularioModal('cliente-form', cliente ? 'Editar cliente' : 'Nuevo cliente', !cliente);
  if (cliente) ['id', 'nombre', 'tipo', 'documento', 'telefono', 'correo', 'direccion'].forEach(campo => document.getElementById(`cliente-${campo}`).value = cliente[campo]);
}

function nombreCliente(id) {
  return clientes.find(c => c.id === String(id))?.nombre || (id ? 'Cliente no disponible' : "Consumidor final");
}

function actualizarSelectClientes() {
  const select = document.getElementById('select-cliente');
  const seleccionado = select.value;
  select.replaceChildren(new Option("Sin cliente", ""));
  clientes.forEach(c => select.add(new Option(c.nombre, c.id)));
  if (seleccionado && !clientes.some(c => c.id === seleccionado)) {
    select.add(new Option(nombreCliente(seleccionado), seleccionado));
  }
  select.value = seleccionado;
}

function renderClientes() {
  const body = document.getElementById('clientes-table-body');
  body.closest('table').classList.add('tabla-fichas');
  const busqueda = document.getElementById('buscar-cliente').value.toLowerCase().trim();
  body.replaceChildren();
  paginarListado('clientes', clientes.filter(c => [c.nombre, c.telefono, c.correo].some(v => v.toLowerCase().includes(busqueda))), busqueda, body.closest('.table-responsive'), renderClientes).forEach(c => {
    const tr = document.createElement('tr');
    const nombre = celdaVista(tr, c.nombre);
    nombre.append(document.createElement('br'), insigniaEstado('neutro', c.tipo === 'empresa' ? 'Empresa' : 'Persona'));
    celdaVista(tr, c.documento);
    celdaVista(tr, [c.telefono || '—', c.correo || '—'].join(' · '));
    filaConDetalle(tr, () => fichaContacto(c, 'cliente'));
    [...tr.cells].forEach((td,i)=>td.dataset.label=['Cliente','Documento','Contacto',''][i]);
    body.appendChild(tr);
  });
  if (!body.rows.length) { const td=body.insertRow().insertCell(); td.colSpan=4; td.className='tabla-vacia'; td.textContent='No hay clientes que coincidan con la búsqueda.'; }
}

function bloquearClientes(bloqueado) {
  clienteGuardando = bloqueado;
  document.getElementById('clientes-estado').textContent = bloqueado ? 'Guardando cambios...' : '';
  document.querySelectorAll('#vista-clientes button, #cliente-form input, #cliente-form select, #cliente-form button').forEach(e => e.disabled = bloqueado);
  indicarFormularioOcupado('cliente-form', bloqueado);
  renderClientes();
}

async function cargarClientes() {
  if (clientesEnCarga) return clientesEnCarga;
  if (clienteGuardando) return;
  const estado = document.getElementById('clientes-estado');
  const estadoPos = document.getElementById('clientes-pos-estado');
  estado.textContent = estadoPos.textContent = '';
  const quitarSkeleton = mostrarSkeleton(document.getElementById('clientes-table-body'), 'tabla', 4);
  const quitarSkeletonPos = mostrarSkeleton(estadoPos);
  document.getElementById('btn-recargar-clientes').disabled = true;
  clientesEnCarga = (async () => {
    try {
      const datos = await apiGet('clientes');
      if (!Array.isArray(datos)) throw new Error('La API debe devolver una lista de clientes.');
      clientes = datos.map(c => ({ ...c, id: String(c.id), nombre: String(c.nombre ?? ''), telefono: String(c.telefono ?? ''), correo: String(c.correo ?? '') }));
      clientesCargados = true;
      renderClientes(); actualizarSelectClientes();
      estado.textContent = estadoPos.textContent = '';
    } catch (error) {
      estado.textContent = estadoPos.textContent = 'No se pudieron cargar los clientes. Reintenta desde Clientes.';
      mostrarNotificacion(error.message, 'error');
    } finally {
      quitarSkeleton(); quitarSkeletonPos();
      document.getElementById('btn-recargar-clientes').disabled = false;
      iniciarBorradorVenta();
    }
  })();
  try { await clientesEnCarga; } finally { clientesEnCarga = null; }
}

async function guardarCliente(event) {
  event.preventDefault();
  if (clienteGuardando || clientesEnCarga) return;
  const idInput = document.getElementById('cliente-id');
  const nombre = document.getElementById('cliente-nombre').value.trim();
  if (!nombre) { mostrarNotificacion('El nombre es obligatorio.', 'error'); return; }
  const existente = clientes.some(c => c.id === idInput.value);
  // Conservar UUID si create guarda el registro pero se pierde su respuesta.
  idInput.value = idInput.value || crypto.randomUUID();
  const cliente = { tipo: document.getElementById('cliente-tipo').value, documento: document.getElementById('cliente-documento').value.trim(), direccion: document.getElementById('cliente-direccion').value.trim(), id: idInput.value, nombre, telefono: document.getElementById('cliente-telefono').value.trim(), correo: document.getElementById('cliente-correo').value.trim() };
  bloquearClientes(true);
  try {
    let guardado;
    try { guardado = await apiPost('clientes', existente ? 'update' : 'create', cliente); }
    catch (error) {
      if (existente) throw error;
      const remotos = await apiGet('clientes');
      guardado = remotos.find(c => String(c.id) === cliente.id);
      if (!guardado) throw error;
    }
    const actualizado = {
      ...cliente, ...guardado,
      id: cliente.id,
      nombre: String(guardado?.nombre ?? cliente.nombre),
      telefono: String(guardado?.telefono ?? cliente.telefono),
      correo: String(guardado?.correo ?? cliente.correo)
    };
    const index = clientes.findIndex(c => c.id === cliente.id);
    if (index < 0) clientes.push(actualizado); else clientes[index] = actualizado;
    document.getElementById('cliente-form').reset(); idInput.value = '';
    actualizarSelectClientes();
    if (clienteDesdePOS) {
      document.getElementById('select-cliente').value = actualizado.id;
      actualizarResumenPOS();
      guardarBorradorVenta();
    }
    // Cerrar después de liberar aria-busy en finally, sin borrar campos si falla.
    indicarFormularioOcupado('cliente-form', false);
    cerrarFormularioModal('cliente-form');
    mostrarNotificacion('Cliente guardado correctamente.', 'exito');
  } catch (error) { mostrarNotificacion(error.message, 'error'); }
  finally { bloquearClientes(false); }
}

async function eliminarCliente(cliente) {
  if (clienteGuardando || clientesEnCarga || productosGuardando || ventaPendiente || ventaAbiertaGuardadoPendiente) return;
  if (!await confirmarAccion(`¿Eliminar a ${cliente.nombre}?`, { titulo: 'Eliminar cliente', aceptar: 'Eliminar', peligrosa: true })) return;
  bloquearClientes(true);
  try {
    const ventas = await apiGet('ventas');
    if (ventas.some(v => String(v.clienteId) === cliente.id) || document.getElementById('select-cliente').value === cliente.id) {
      throw new Error('No puedes eliminar un cliente asociado a una venta.');
    }
    await apiPost('clientes', 'delete', { id: cliente.id });
    clientes = clientes.filter(c => c.id !== cliente.id);
    if (document.getElementById('cliente-id').value === cliente.id) {
      document.getElementById('cliente-form').reset(); document.getElementById('cliente-id').value = '';
    }
    actualizarSelectClientes();
    mostrarNotificacion('Cliente eliminado.', 'exito');
  } catch (error) { mostrarNotificacion(error.message, 'error'); }
  finally { bloquearClientes(false); }
}
