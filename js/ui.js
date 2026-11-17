// Interacciones compartidas. No contiene reglas de ventas ni peticiones HTTP.
let resolverConfirmacion = null;
const focosModales = new Map();
function abrirModalConFoco(modal, destino = null) {
  if (modal.classList.contains('hidden')) focosModales.set(modal, document.activeElement);
  document.body.append(modal); // El último modal abierto queda encima de su formulario de origen.
  modal.inert = false;
  modal.classList.remove('hidden');
  // El fondo se libera/restaura por el observer; el formulario recibe foco directo.
  (destino || modal.querySelector('[data-foco-inicial], input:not([type="hidden"]):not(:disabled)') || controlesEnModal(modal)[0])?.focus();
}
function escaparHTML(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function confirmarAccion(mensaje, { titulo = 'Confirmar acción', aceptar = 'Confirmar', peligrosa = false } = {}) {
  if (resolverConfirmacion) return Promise.resolve(false);
  const modal = document.getElementById('confirmacion-modal');
  document.getElementById('confirmacion-titulo').textContent = titulo;
  document.getElementById('confirmacion-mensaje').textContent = mensaje;
  const boton = document.getElementById('confirmacion-aceptar');
  boton.textContent = aceptar;
  boton.className = peligrosa ? 'btn-danger' : 'btn-primary';
  abrirModalConFoco(modal, document.getElementById('confirmacion-cancelar'));
  return new Promise(resolve => { resolverConfirmacion = resolve; });
}

function responderConfirmacion(aceptada) {
  document.getElementById('confirmacion-modal').classList.add('hidden');
  const resolver = resolverConfirmacion;
  resolverConfirmacion = null;
  if (resolver) resolver(aceptada);
}

function abrirFormularioModal(formularioId, titulo, nuevo = false, mostrar = true) {
  const form = document.getElementById(formularioId);
  let modal = form.closest('.modal-overlay');
  if (!modal) {
    modal = document.createElement('div'); modal.className = 'modal-overlay hidden';
    modal.id = `${formularioId}-modal`; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', `${formularioId}-titulo`);
    const tarjeta = document.createElement('div'); tarjeta.className = 'modal-card modal-compacta';
    const cabecera = document.createElement('div'); cabecera.className = 'modal-header';
    const h3 = document.createElement('h3'); h3.id = `${formularioId}-titulo`;
    const cerrar = document.createElement('button'); cerrar.type = 'button'; cerrar.className = 'close-modal-btn'; cerrar.textContent = '×';
    cerrar.setAttribute('aria-label', 'Cerrar formulario'); cerrar.dataset.cerrarModal = '';
    cerrar.addEventListener('click', () => cerrarFormularioModal(formularioId));
    cabecera.append(h3, cerrar); tarjeta.append(cabecera, form); modal.append(tarjeta); document.body.append(modal);
    const cancelar = document.createElement('button'); cancelar.type = 'button'; cancelar.className = 'btn-cancel'; cancelar.textContent = 'Cancelar';
    cancelar.dataset.cerrarModal = ''; cancelar.addEventListener('click', () => cerrarFormularioModal(formularioId));
    form.append(cancelar);
  }
  if (nuevo) { form.reset(); form.querySelector('input[type="hidden"]').value = ''; }
  document.getElementById(`${formularioId}-titulo`).textContent = titulo;
  if (mostrar) abrirModalConFoco(modal, form.querySelector('input:not([type="hidden"])'));
}

function cerrarFormularioModal(formularioId) {
  const form = document.getElementById(formularioId);
  if (form.getAttribute('aria-busy') === 'true') return;
  form.closest('.modal-overlay')?.classList.add('hidden');
}

function indicarFormularioOcupado(formularioId, ocupado) {
  const form = document.getElementById(formularioId);
  form.setAttribute('aria-busy', String(ocupado));
  form.closest('.modal-overlay')?.querySelectorAll('[data-cerrar-modal]').forEach(b => b.disabled = ocupado);
}

function controlesEnModal(modal) {
  return [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
    .filter(el => !el.disabled && el.type !== 'hidden' && el.getClientRects().length);
}

function actualizarFocoModales() {
  const modales = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
  const superior = modales.find(m => m.id === 'login-modal') || modales.find(m => m.id === 'confirmacion-modal') || modales.at(-1);
  modales.forEach(m => m.inert = m !== superior);
  document.querySelectorAll('body > header, body > main').forEach(el => el.inert = modales.length > 0);
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    const abierto = !modal.classList.contains('hidden');
    if (abierto && !focosModales.has(modal)) {
      focosModales.set(modal, document.activeElement);
      const controles = controlesEnModal(modal);
      // En confirmaciones peligrosas, el foco inicial queda en Cancelar.
      (modal.querySelector('[data-foco-inicial], input:not([type="hidden"]):not(:disabled)') || controles[0])?.focus();
    } else if (!abierto && focosModales.has(modal)) {
      const anterior = focosModales.get(modal); focosModales.delete(modal);
      if (anterior?.isConnected && !anterior.disabled) anterior.focus();
    }
  });
  const bloqueado = modales.length > 0;
  // El observer también observa body: no reescribir su clase si no cambia.
  if (document.body.classList.contains('modal-abierto') !== bloqueado) document.body.classList.toggle('modal-abierto', bloqueado);
}

document.addEventListener('DOMContentLoaded', () => {
  const trazos = {
    editar:'M4 16 16 4l4 4L8 20H4v-4Z M14 6l4 4',
    eliminar:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
    guardar:'M4 3h13l3 3v15H4Z M8 3v6h8V3 M8 21v-8h8v8',
    agregar:'M12 4v16 M4 12h16',
    cancelar:'M5 5l14 14 M19 5 5 19',
    resolver:'m4 12 5 5L20 6',
    consultar:'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z M15 15l6 6',
    volver:'m10 5-7 7 7 7 M3 12h18'
  };
  const decorar = raiz => {
    const botones = [...(raiz.matches?.('button') ? [raiz] : []), ...raiz.querySelectorAll('button')];
    botones.forEach(b => {
      if(b.querySelector('svg') || b.classList.contains('nav-btn')) return;
      const texto=b.textContent.trim().toLowerCase();
      const tipo=/editar/.test(texto)?'editar':/eliminar|quitar|vaciar/.test(texto)?'eliminar':/guardar/.test(texto)?'guardar':/finalizar|resolver|resuelto/.test(texto)?'resolver':/cancelar/.test(texto)?'cancelar':/nuevo|nueva|agregar|registrar/.test(texto)?'agregar':/volver|anterior/.test(texto)?'volver':/ver |consultar|detalle|reporte/.test(texto)?'consultar':null;
      if(!tipo)return;
      const primerTexto=[...b.childNodes].find(n=>n.nodeType===3);
      if(primerTexto) primerTexto.textContent=primerTexto.textContent.replace(/^\s*[+＋↻]\s*/, '');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.classList.add('icono-accion');
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',trazos[tipo]);svg.append(path);b.prepend(svg);
    });
  };
  decorar(document);
  new MutationObserver(cambios=>cambios.forEach(c=>c.addedNodes.forEach(n=>{if(n.nodeType===1 && n.namespaceURI!=='http://www.w3.org/2000/svg')decorar(n);}))).observe(document.body,{childList:true,subtree:true});
  const filtrosMoviles=matchMedia('(max-width:600px)');
  document.querySelectorAll('.filtros-listado').forEach(filtros=>{
    const detalles=document.createElement('details'); detalles.className='filtros-plegables';
    const titulo=document.createElement('summary');titulo.textContent='Buscar y filtrar';
    filtros.before(detalles);detalles.append(titulo,filtros);
    const adaptar=()=>detalles.open=!filtrosMoviles.matches; adaptar();filtrosMoviles.addEventListener('change',adaptar);
  });
  const menuExtra = document.querySelector('.nav-more');
  const pantallaPequena = matchMedia('(max-width: 600px)');
  const adaptarMenu = () => { menuExtra.open = !pantallaPequena.matches; };
  adaptarMenu();
  pantallaPequena.addEventListener('change', adaptarMenu);
  menuExtra.addEventListener('click', event => {
    if (pantallaPequena.matches && event.target.closest('.nav-btn')) menuExtra.open = false;
  });
  // La lista del POS termina físicamente antes de la barra fija de factura.
  const ajustarAlturaListaPos = () => requestAnimationFrame(() => {
    const vista = document.getElementById('vista-pos');
    const lista = document.getElementById('product-grid');
    const accesoFactura = document.getElementById('acceso-venta-movil');
    if (!pantallaPequena.matches || vista.classList.contains('vista-oculta')) {
      lista.style.removeProperty('--altura-lista-pos-movil');
      return;
    }
    const inicio = lista.getBoundingClientRect().top;
    const fin = accesoFactura.getBoundingClientRect().top;
    if (fin > inicio) lista.style.setProperty('--altura-lista-pos-movil', `${Math.max(120, fin - inicio - 8)}px`);
  });
  window.addEventListener('resize', ajustarAlturaListaPos);
  window.visualViewport?.addEventListener('resize', ajustarAlturaListaPos);
  pantallaPequena.addEventListener('change', ajustarAlturaListaPos);
  document.getElementById('btn-nav-pos').addEventListener('click', ajustarAlturaListaPos);
  new ResizeObserver(ajustarAlturaListaPos).observe(document.getElementById('catalogo-productos'));
  ajustarAlturaListaPos();
  let alturaMovil = window.visualViewport?.height || innerHeight;
  const adaptarTeclado = () => {
    const escribiendo = document.activeElement?.matches('input:not([type="button"]):not([type="submit"]),textarea');
    const altura = window.visualViewport?.height || innerHeight;
    if (!escribiendo) alturaMovil = Math.max(alturaMovil, altura);
    document.body.classList.toggle('teclado-abierto', pantallaPequena.matches && Boolean(escribiendo) && altura < alturaMovil * .78);
  };
  window.visualViewport?.addEventListener('resize', adaptarTeclado);
  document.addEventListener('focusin', adaptarTeclado);
  document.addEventListener('focusout', () => setTimeout(adaptarTeclado,0));
  // El resumen móvil refleja el total ya calculado; nunca recalcula importes.
  const total = document.getElementById('total-valor');
  const totalMovil = document.getElementById('total-venta-movil');
  const sincronizarTotalMovil = () => { totalMovil.textContent = total.textContent; document.getElementById('cantidad-venta-movil').textContent = factura.reduce((n,p)=>n+p.cantidad,0); };
  new MutationObserver(sincronizarTotalMovil).observe(total, { childList: true, characterData: true, subtree: true });
  sincronizarTotalMovil();
  document.getElementById('acceso-venta-movil').addEventListener('click', () => {
    document.getElementById('vista-pos').classList.add('mostrando-factura');
    const panel = document.getElementById('panel-venta');
    panel.scrollIntoView({ block: 'start' });
    panel.focus({ preventScroll: true });
  });
  document.getElementById('volver-catalogo-movil').addEventListener('click', () => {
    document.getElementById('vista-pos').classList.remove('mostrando-factura');
    document.getElementById('search-input').focus({preventScroll:true});
    document.getElementById('catalogo-productos').scrollIntoView({block:'start'});
  });
  document.getElementById('confirmacion-aceptar').addEventListener('click', () => responderConfirmacion(true));
  document.getElementById('confirmacion-cancelar').addEventListener('click', () => responderConfirmacion(false));
  new MutationObserver(actualizarFocoModales).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  actualizarFocoModales();
  document.addEventListener('keydown', event => {
    const modales = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
    const modal = modales.find(m => m.id === 'login-modal') || modales.find(m => m.id === 'confirmacion-modal') || modales.at(-1);
    if (!modal) {
      const menu = document.activeElement.closest('details[open]');
      if (event.key === 'Escape' && menu) { menu.open=false; menu.querySelector('summary').focus(); event.preventDefault(); }
      return;
    }
    if (event.key === 'Escape') {
      if (modal.querySelector('[aria-busy="true"]')) return;
      if (modal.id === 'confirmacion-modal') responderConfirmacion(false);
      else modal.querySelector('[data-cerrar-modal], .close-modal-btn:not(:disabled)')?.click();
      event.preventDefault();
    }
    if (event.key === 'Tab') {
      const controles = controlesEnModal(modal); if (!controles.length) return;
      if (event.shiftKey && document.activeElement === controles[0]) { controles.at(-1).focus(); event.preventDefault(); }
      else if (!event.shiftKey && document.activeElement === controles.at(-1)) { controles[0].focus(); event.preventDefault(); }
    }
  });
});
