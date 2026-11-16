// Paginación de presentación: nunca recorta los datos usados por el negocio.
const paginasListados = new Map();
function paginarListado(clave, registros, filtros, destino, renderizar) {
  let estado = paginasListados.get(clave);
  if (!estado) { estado = { pagina: 1, limite: 10, filtros }; paginasListados.set(clave, estado); }
  if (estado.filtros !== filtros) { estado.pagina = 1; estado.filtros = filtros; }
  const paginas = Math.max(1, Math.ceil(registros.length / estado.limite));
  estado.pagina = Math.min(estado.pagina, paginas);
  let pie = document.getElementById('paginacion-' + clave);
  if (!pie) {
    pie = document.createElement('nav'); pie.id = 'paginacion-' + clave; pie.className = 'paginacion';
    pie.setAttribute('aria-label', 'Páginas de ' + clave); destino.after(pie);
  }
  pie.replaceChildren();
  const inicio = (estado.pagina - 1) * estado.limite;
  const resumen = document.createElement('span'); resumen.setAttribute('role', 'status');
  resumen.textContent = `Mostrando ${registros.length ? inicio + 1 : 0}–${Math.min(inicio + estado.limite, registros.length)} de ${registros.length}`;
  const label = document.createElement('label'); label.textContent = 'Por página ';
  const select = document.createElement('select');
  [5,10,25,50,100].forEach(n => select.add(new Option(n,n))); select.value = estado.limite;
  select.addEventListener('change', () => { estado.limite = Number(select.value); estado.pagina = 1; renderizar(); document.querySelector(`#${pie.id} select`).focus(); });
  label.append(select); pie.append(resumen,label);
  [-1,1].forEach((paso,i) => {
    const b = document.createElement('button'); b.type='button'; b.className='btn-secondary';
    b.textContent = i ? 'Siguiente →' : '← Anterior'; b.disabled = i ? estado.pagina===paginas : estado.pagina===1;
    b.addEventListener('click', () => { estado.pagina += paso; renderizar(); const botones=pie.querySelectorAll('button'); (botones[i].disabled ? botones[1-i] : botones[i]).focus(); }); pie.append(b);
  });
  return registros.slice(inicio, inicio + estado.limite);
}
