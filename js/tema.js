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
    const selectores = document.querySelectorAll('[data-selector-tema]');
    selectores.forEach(select => {
      select.value = actual;
      select.addEventListener('change', () => {
        if (!temas.includes(select.value)) return;
        actual = select.value;
        document.documentElement.dataset.tema = actual;
        selectores.forEach(otro => otro.value = actual);
        try { localStorage.setItem(clave, actual); } catch { /* Conserva el tema durante la sesión. */ }
      });
    });
  });
})();
