// Presentación compartida de fichas y listados. Las escrituras siguen en sus módulos.
function dineroVista(valor) { return '$' + Number(valor || 0).toLocaleString('es-CO'); }
function fechaVista(valor) { return new Date(valor).toLocaleString('es-CO'); }
function fechaLocal(valor = new Date()) {
  const d = new Date(valor);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function estadoProducto(p) {
  if (!p.trackStock) return { clave: 'disponible', texto: 'Disponible · sin seguimiento' };
  if (p.stock <= 0) return { clave: 'agotado', texto: 'Sin stock' };
  if (p.stock < 10) return { clave: 'bajo', texto: 'Stock bajo' };
  return { clave: 'disponible', texto: 'Disponible' };
}
function insigniaEstado(clave, texto) {
  const span = document.createElement('span'); span.className = `estado-badge estado-${clave}`; span.textContent = texto; return span;
}
function tablaVista(titulos) {
  const tabla = document.createElement('table'); tabla.className = 'crud-table tabla-fichas';
  const head = tabla.createTHead().insertRow();
  titulos.forEach(t => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = t; head.append(th); });
  tabla.createTBody(); return tabla;
}
function celdaVista(fila, texto) { const td = fila.insertCell(); td.textContent = texto === '' || texto == null ? '—' : texto; td.dataset.label = fila.closest('table')?.tHead?.rows[0]?.cells[td.cellIndex]?.textContent || ''; return td; }
function filaConDetalle(fila, abrir) {
  const td = fila.insertCell(); const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-discreto'; btn.textContent = 'Ver ficha ↗';
  btn.addEventListener('click', abrir); td.append(btn);
  fila.classList.add('fila-detalle');
  fila.addEventListener('click', e => { if (!e.target.closest('button,a,input,select')) { btn.focus(); btn.click(); } });
}
function datosFicha(pares) {
  const dl = document.createElement('dl'); dl.className = 'ficha-datos';
  pares.forEach(([nombre, valor]) => { const grupo = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = nombre; dd.textContent = valor === '' || valor == null ? '—' : valor; grupo.append(dt, dd); dl.append(grupo); });
  return dl;
}
function cerrarFicha() { document.getElementById('ficha-modal')?.classList.add('hidden'); }
function abrirFicha(titulo, contenido, acciones = []) {
  let modal = document.getElementById('ficha-modal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'ficha-modal'; modal.className = 'modal-overlay hidden'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-labelledby','ficha-titulo');
    modal.innerHTML = '<div class="modal-card ficha-card"><div class="modal-header"><h3 id="ficha-titulo"></h3><button type="button" class="close-modal-btn" aria-label="Cerrar ficha" data-cerrar-modal>×</button></div><div id="ficha-contenido"></div><div id="ficha-acciones" class="modal-actions"></div></div>';
    modal.querySelector('[data-cerrar-modal]').addEventListener('click', cerrarFicha); document.body.append(modal);
  }
  document.getElementById('ficha-titulo').textContent = titulo;
  document.getElementById('ficha-contenido').replaceChildren(...contenido);
  const footer = document.getElementById('ficha-acciones'); footer.replaceChildren();
  acciones.forEach(({texto, clase='btn-secondary', ejecutar}) => { const b = document.createElement('button'); b.type='button'; b.className=clase; b.textContent=texto; b.addEventListener('click', () => { cerrarFicha(); ejecutar(); }); footer.append(b); });
  abrirModalConFoco(modal, modal.querySelector('[data-cerrar-modal]'));
}
function fichaContacto(registro, tipo) {
  const cliente = tipo === 'cliente';
  abrirFicha(registro.nombre, [datosFicha([
    ['Tipo', registro.tipo === 'empresa' ? 'Empresa' : 'Persona'], ['Documento / NIT', registro.documento],
    ['Teléfono', registro.telefono], ['Correo', registro.correo], ['Dirección', registro.direccion]
  ])], [
    { texto: 'Editar', ejecutar: () => cliente ? abrirClienteModal(registro) : editarProveedor(registro) },
    { texto: 'Eliminar', clase: 'btn-danger', ejecutar: () => cliente ? eliminarCliente(registro) : eliminarGestion('proveedores', registro) }
  ]);
}
function actualizarResumenPOS() {
  const cliente = document.getElementById('select-cliente');
  document.getElementById('pos-cliente-resumen').textContent = cliente.value ? (cliente.selectedOptions[0]?.textContent || 'Cliente') : 'Consumidor final';
  const descuento = document.getElementById('select-descuento');
  document.getElementById('pos-descuento-resumen').textContent = descuento.value ? `${descuento.selectedOptions[0]?.textContent || 'Descuento'} · Cambiar` : '＋ Aplicar descuento';
}
// Mismo día contable que Django (America/Bogota), incluso en otro huso horario.
function fechaNegocio(valor = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(valor));
}
function tarjetaIndicador(titulo, valor, nota, clave) {
  const card = document.createElement('article'); card.className = 'dashboard-card';
  if (clave) card.dataset.indicador = clave;
  const h = document.createElement('h3'), n = document.createElement('strong'), p = document.createElement('p');
  h.textContent=titulo; n.textContent=valor; p.textContent=nota; card.append(h,n,p); return card;
}
function renderInventarioInicio() {
  const destino = document.getElementById('inicio-inventario'); destino.replaceChildren();
  if (!catalogoCargado) { destino.textContent = 'El catálogo no está disponible. Puedes reintentar desde Productos.'; return; }
  const agotados = productos.filter(p => p.trackStock && p.stock <= 0);
  const bajos = productos.filter(p => p.trackStock && p.stock > 0 && p.stock < 10);
  [[agotados, 'sin existencias'], [bajos, 'con stock bajo']].forEach(([lista, etiqueta]) => {
    const grupo = document.createElement('div'); grupo.className='inventario-alerta';
    const h = document.createElement('strong'), p = document.createElement('p');
    h.textContent=`${lista.length} ${lista.length === 1 ? 'producto' : 'productos'} ${etiqueta}`;
    p.textContent=lista.length ? lista.slice(0,3).map(p=>p.nombre).join(', ') + (lista.length>3 ? ` y ${lista.length-3} más.` : '.') : 'Todo en orden por aquí.';
    grupo.append(h,p); destino.append(grupo);
  });
  const nota=document.createElement('p'); nota.className='section-help'; nota.textContent=`${agotados.length+bajos.length} referencias requieren atención. Stock bajo: menos de 10 unidades.`; destino.append(nota);
}
function renderMovimientosInicio(ventas, compras) {
  const destino=document.getElementById('inicio-movimientos'); destino.replaceChildren();
  const movimientos=[...ventas.map(v=>({ ...v, tipo: v.estado==='abierta'?'Venta guardada':'Venta finalizada', prefijo:'VTA', nav:'historial' })),
    ...compras.map(c=>({...c,tipo:'Compra registrada',prefijo:'CMP',nav:'compras'}))]
    .sort((a,b)=>new Date(b.actualizadoEn||b.fecha)-new Date(a.actualizadoEn||a.fecha)).slice(0,6);
  if (!movimientos.length) { destino.textContent='Todavía no hay movimientos registrados.'; return; }
  const lista=document.createElement('ul'); lista.className='movimientos-lista';
  movimientos.forEach(m=>{
    const li=document.createElement('li'), icono=document.createElement('span'), texto=document.createElement('div'), enlace=document.createElement('button'), fecha=document.createElement('time'), total=document.createElement('strong');
    icono.className='movimiento-icono'; icono.setAttribute('aria-hidden','true');
    icono.textContent=m.nav==='compras'?'↙':m.estado==='abierta'?'◷':'↗';
    enlace.type='button'; enlace.className='movimiento-enlace'; enlace.textContent=`${m.tipo} · ${referenciaVisible(m.id,m.prefijo)}`;
    enlace.addEventListener('click',()=>{
      if(m.nav==='historial') { document.getElementById('historial-buscar').value=referenciaVisible(m.id,'VTA'); document.getElementById('historial-estado').value=''; }
      document.getElementById(`btn-nav-${m.nav}`).click();
    });
    fecha.dateTime=m.actualizadoEn||m.fecha;
    fecha.textContent=new Date(fecha.dateTime).toLocaleString('es-CO',{ timeZone:'America/Bogota',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' });
    total.textContent=dineroVista(m.total); texto.append(enlace,fecha); li.append(icono,texto,total); lista.append(li);
  });
  destino.append(lista);
}
let inicioEnCarga = null;
let inicioUsuario = null;
function cargarInicio() {
  const usuario=window.usuarioActual;
  if (inicioEnCarga && inicioUsuario === usuario) return inicioEnCarga;
  inicioUsuario=usuario;
  inicioEnCarga=cargarDatosInicio(usuario).finally(()=>{ if(inicioUsuario===usuario) inicioEnCarga=null; });
  return inicioEnCarga;
}
async function cargarDatosInicio(usuario) {
  const resumen = document.getElementById('inicio-resumen');
  const movimientos = document.getElementById('inicio-movimientos');
  // Evita restaurar datos de la sesión anterior durante una nueva lectura.
  resumen.replaceChildren(); movimientos.replaceChildren();
  resumen.dataset.estado='cargando';
  const quitar = mostrarSkeleton(resumen, 'tarjetas'), quitarMovimientos=mostrarSkeleton(movimientos);
  document.getElementById('inicio-fecha').textContent=new Date().toLocaleDateString('es-CO',{timeZone:'America/Bogota',weekday:'long',day:'numeric',month:'long',year:'numeric'})+' · Valores en COP';
  renderInventarioInicio();
  try {
    const [resultadoVentas, resultadoCompras] = await Promise.allSettled([
      apiGet('ventas'), usuario?.esAdmin ? apiGet('compras') : Promise.resolve([])
    ]);
    if (window.usuarioActual !== usuario) return;
    if(resultadoVentas.status==='rejected') throw resultadoVentas.reason;
    const ventas=resultadoVentas.value;
    const cerradasHoy=ventas.filter(v=>v.estado==='cerrada' && fechaNegocio(v.fecha)===fechaNegocio());
    const abiertas = ventas.filter(v => v.estado === 'abierta').length;
    resumen.replaceChildren(
      tarjetaIndicador('Ventas del día',dineroVista(cerradasHoy.reduce((s,v)=>s+Number(v.total),0)),'Total facturado hoy · antes de reembolsos','ventas-dia'),
      tarjetaIndicador('Cantidad de ventas',cerradasHoy.length,'Ventas finalizadas con fecha de hoy','cantidad'),
      tarjetaIndicador('Ventas abiertas',abiertas,'Pendientes de finalizar','abiertas')
    );
    renderMovimientosInicio(ventas,resultadoCompras.status==='fulfilled'?resultadoCompras.value:[]);
    if(resultadoCompras.status==='rejected') {
      const aviso=document.createElement('p'); aviso.className='section-help'; aviso.textContent=`Compras no disponibles: ${resultadoCompras.reason.message}`; movimientos.append(aviso);
    }
    resumen.dataset.estado='listo';
  } catch(error) {
    if(window.usuarioActual===usuario) {
      resumen.replaceChildren(); resumen.textContent=`No se pudo cargar el resumen: ${error.message}`; resumen.dataset.estado='error';
      movimientos.replaceChildren(); movimientos.textContent='Vuelve a Inicio para reintentar la consulta.';
      mostrarNotificacion(error.message,'error');
    }
  } finally { quitar(); quitarMovimientos(); }
}
function renderResumenReporte(data) {
  const v=data.ventasTotales,c=data.comprasRegistradas;
  document.getElementById('reporte-periodo').textContent=`Del ${data.rango.fechaInicio} al ${data.rango.fechaFin} · Pesos colombianos (COP)`;
  document.getElementById('reportes-resumen-cards').replaceChildren(
    tarjetaIndicador('Ventas netas',dineroVista(v.ventasNetas),'Facturación menos reembolsos','netas'),
    tarjetaIndicador('Total facturado',dineroVista(v.totalFacturado),'Ventas cerradas en el período','facturado'),
    tarjetaIndicador('Ventas cerradas',v.cantidadVentas,'Cantidad de facturas','cantidad'),
    tarjetaIndicador('Reembolsos',dineroVista(v.totalReembolsado),'Importe descontado de la facturación','reembolsos'),
    tarjetaIndicador('Compras registradas',c.cantidadCompras,'Operaciones en el período','compras'),
    tarjetaIndicador('Total de compras',dineroVista(c.montoTotalCompras),'Importe registrado','monto-compras')
  );
}
function completarTablasReporte() {
  for (const [id,contador,columnas] of [['reporte-mas-vendidos-body','reporte-vendidos-cantidad',3],['reporte-compras-body','reporte-compras-cantidad',4],['reporte-faltantes-body','reporte-faltantes-cantidad',4]]) {
    const body=document.getElementById(id), n=body.rows.length;
    document.getElementById(contador).textContent=`${n} ${n===1?'registro':'registros'}`;
    if(!n) { const celda=body.insertRow().insertCell(); celda.colSpan=columnas; celda.textContent='Sin registros para mostrar.'; }
    const titulos=body.closest('table').tHead.rows[0].cells;
    body.closest('table').classList.add('tabla-fichas');
    [...body.rows].forEach(fila=>[...fila.cells].forEach((celda,i)=>{if(!celda.hasAttribute('colspan'))celda.dataset.label=titulos[i].textContent;}));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  for (const [form,boton,titulo] of [['categorias-form','btn-nueva-categoria','Nueva categoría'],['descuentos-form','btn-nuevo-descuento','Nuevo descuento']]) {
    abrirFormularioModal(form,titulo,false,false);
    document.getElementById(boton).addEventListener('click',()=>{
      document.getElementById(form).reset(); document.getElementById(form.replace('-form','-id')).value=''; abrirFormularioModal(form,titulo);
    });
    document.getElementById(form.replace('-form','-cancelar')).addEventListener('click',()=>cerrarFormularioModal(form));
  }
  document.getElementById('descuentos-buscar').addEventListener('input',renderTablaDescuentos);
  document.getElementById('descuentos-filtro').addEventListener('change',renderTablaDescuentos);
  document.getElementById('faltantes-buscar').addEventListener('input',renderFaltantes);
  document.getElementById('faltantes-estado').addEventListener('change',renderFaltantes);
  // Reutiliza los formularios existentes con sus listeners y estados de guardado.
  abrirFormularioModal('compra-form', 'Registrar compra', false, false);
  document.getElementById('compra-form').closest('.modal-card').classList.add('modal-compra');
  abrirFormularioModal('faltante-form', 'Registrar faltante', false, false);
  document.getElementById('btn-nueva-compra').addEventListener('click', () => abrirFormularioModal('compra-form','Registrar compra'));
  document.getElementById('btn-nuevo-faltante').addEventListener('click', () => abrirFormularioModal('faltante-form','Registrar faltante'));
  for (const id of ['productos-buscar','productos-categoria','productos-estado']) document.getElementById(id).addEventListener(id.endsWith('buscar')?'input':'change', () => renderTablaCRUD(productos));
  for (const id of ['compras-buscar','compras-fecha-desde','compras-fecha-hasta']) document.getElementById(id).addEventListener(id.endsWith('buscar')?'input':'change', renderListaCompras);
  document.getElementById('historial-buscar').addEventListener('input', renderTablaHistorial);
  document.getElementById('historial-estado').addEventListener('change', renderTablaHistorial);
  for (const id of ['select-cliente','select-descuento']) {
    const select=document.getElementById(id);
    select.addEventListener('change', () => { actualizarResumenPOS(); select.closest('details').open=false; });
    new MutationObserver(actualizarResumenPOS).observe(select,{childList:true});
  }
  document.getElementById('inicio-nueva-venta').addEventListener('click', () => document.getElementById('btn-nav-pos').click());
  document.getElementById('inicio-abiertas').addEventListener('click', () => { document.getElementById('historial-buscar').value=''; document.getElementById('historial-estado').value='abierta'; document.getElementById('btn-nav-historial').click(); });
  document.getElementById('inicio-faltantes').addEventListener('click', () => document.getElementById('btn-nav-faltantes').click());
  document.getElementById('inicio-historial').addEventListener('click', () => { document.getElementById('historial-estado').value=''; document.getElementById('historial-buscar').value=''; document.getElementById('btn-nav-historial').click(); });
  document.getElementById('inicio-inventario-ir').addEventListener('click', () => document.getElementById('btn-nav-productos').click());
  document.getElementById('inicio-compras').addEventListener('click', () => document.getElementById('btn-nav-compras').click());
});
