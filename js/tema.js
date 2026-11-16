// Preferencia visual del navegador. Sin datos del negocio ni llamadas a la API.
// Se ejecuta antes del CSS para evitar un destello de otra paleta al recargar.
(() => {
  const clave = 'papel-luna:tema:v1';
  const temas = ['ciruela', 'terracota', 'tinta'];
  let actual = 'ciruela';
  try {
    const guardado = localStorage.getItem(clave);
    if (temas.includes(guardado)) actual = guardado;
  } catch { /* Ciruela funciona también sin almacenamiento permitido. */ }
  document.documentElement.dataset.tema = actual;
  document.addEventListener('DOMContentLoaded', () => {
    const nombres = { ciruela: 'Ciruela', terracota: 'Terracota', tinta: 'Azul tinta' };
    const menus = [];
    let transicion;
    const sincronizar = () => menus.forEach(menu => {
      menu.querySelector('summary').setAttribute('aria-label', `Apariencia: ${nombres[actual]}. Cambiar estilo`);
      menu.querySelectorAll('[data-tema-opcion]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.temaOpcion === actual)));
    });
    document.querySelectorAll('[data-theme-control]').forEach(contenedor => {
      const menu = document.createElement('details'); menu.className = 'appearance-menu';
      menu.innerHTML = '<summary title="Cambiar apariencia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="7" r=".8"/><circle cx="16" cy="8.5" r=".8"/></svg></summary><div class="appearance-options" role="group" aria-label="Estilo de la aplicación"><p>Apariencia</p></div>';
      const opciones = menu.querySelector('.appearance-options');
      temas.forEach(tema => {
        const boton = document.createElement('button'); boton.type = 'button'; boton.dataset.temaOpcion = tema;
        boton.innerHTML = `<span class="theme-swatch swatch-${tema}" aria-hidden="true"></span><span>${nombres[tema]}</span><span class="theme-check" aria-hidden="true">✓</span>`;
        boton.addEventListener('click', () => {
        actual = tema;
        clearTimeout(transicion);
        document.documentElement.classList.add('tema-cambiando');
        document.documentElement.dataset.tema = actual;
        transicion = setTimeout(() => document.documentElement.classList.remove('tema-cambiando'), 180);
        sincronizar();
        try { localStorage.setItem(clave, actual); } catch { /* Conserva el tema durante la sesión. */ }
        menu.open = false; menu.querySelector('summary').focus();
        });
        opciones.append(boton);
      });
      menu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); event.stopPropagation(); }
        const botones = [...opciones.querySelectorAll('button')];
        if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault(); menu.open = true;
          const i = botones.indexOf(document.activeElement);
          const siguiente = event.key === 'Home' ? 0 : event.key === 'End' ? botones.length-1 : (i + (event.key === 'ArrowUp' ? -1 : 1) + botones.length) % botones.length;
          botones[siguiente].focus();
        }
      });
      menus.push(menu); contenedor.append(menu);
    });
    sincronizar();
    document.addEventListener('click', event => menus.forEach(menu => { if (!menu.contains(event.target)) menu.open = false; }));
    document.addEventListener('focusin', event => menus.forEach(menu => { if (!menu.contains(event.target)) menu.open = false; }));
  });
})();
