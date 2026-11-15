// Interacciones compartidas. No contiene reglas de ventas ni peticiones HTTP.
let resolverConfirmacion = null;
const focosModales = new Map();
function abrirModalConFoco(modal, destino = null) {
  if (modal.classList.contains('hidden')) focosModales.set(modal, document.activeElement);
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
  const menuExtra = document.querySelector('.nav-more');
  const pantallaPequena = matchMedia('(max-width: 600px)');
  const adaptarMenu = () => { menuExtra.open = !pantallaPequena.matches; };
  adaptarMenu();
  pantallaPequena.addEventListener('change', adaptarMenu);
  menuExtra.addEventListener('click', event => {
    if (pantallaPequena.matches && event.target.closest('.nav-btn')) menuExtra.open = false;
  });
  // El resumen móvil refleja el total ya calculado; nunca recalcula importes.
  const total = document.getElementById('total-valor');
  const totalMovil = document.getElementById('total-venta-movil');
  const sincronizarTotalMovil = () => { totalMovil.textContent = total.textContent; };
  new MutationObserver(sincronizarTotalMovil).observe(total, { childList: true, characterData: true, subtree: true });
  sincronizarTotalMovil();
  new IntersectionObserver(entries => {
    document.getElementById('acceso-venta-movil').classList.toggle('en-factura', entries[0].isIntersecting);
  }).observe(document.getElementById('panel-venta'));
  document.getElementById('acceso-venta-movil').addEventListener('click', () => {
    const panel = document.getElementById('panel-venta');
    panel.scrollIntoView({ block: 'start' });
    panel.focus({ preventScroll: true });
  });
  document.getElementById('confirmacion-aceptar').addEventListener('click', () => responderConfirmacion(true));
  document.getElementById('confirmacion-cancelar').addEventListener('click', () => responderConfirmacion(false));
  new MutationObserver(actualizarFocoModales).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  actualizarFocoModales();
  document.addEventListener('keydown', event => {
    const modales = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
    const modal = modales.find(m => m.id === 'login-modal') || modales.find(m => m.id === 'confirmacion-modal') || modales.at(-1);
    if (!modal) return;
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
