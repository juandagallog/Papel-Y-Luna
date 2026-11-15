# Segunda iteración visual — ciruela editorial

Rama: `mejoras/ux-mvp3-figma-02`. Los cambios anteriores se conservan sin commit; esta iteración no publica ni despliega.

## Cambiar la paleta

El control ◐ en la cabecera y el login permite elegir Ciruela, Terracota o Azul tinta. Son tres temas claros, no un modo oscuro.

`css/Style.css` comienza con las variables globales. `:root` define ciruela y los colores de estados; `:root[data-tema="terracota"]` y `:root[data-tema="tinta"]` sobrescriben los colores de marca. Para personalizar un tema, edita su bloque. Los componentes utilizan variables, no HEX repetidos.

| Variable | Ciruela | Terracota | Azul tinta |
|---|---|---|---|
| `--color-primary` | #593C56 | #913F2D | #274961 |
| `--color-primary-hover` | #432D41 | #743123 | #1C3547 |
| `--color-bg` | #F8F5EF | #FAF5EF | #F5F4EF |
| `--color-accent` | #EEE6EF | #F4E6DC | #E5EDF2 |
| `--color-card` | #FFFFFF | #FFFFFF | #FFFFFF |
| `--color-text` | #302A32 | #352D29 | #26323B |
| `--color-muted` | #665C66 | #6F5D54 | #5D6972 |
| `--color-border` | #DCD4DC | #E2D6CA | #D5DCE0 |
| `--color-control-border` | #908490 | #9A8375 | #83929C |
| `--color-skeleton` | #E4DCE5 | #EBDDD1 | #DCE5EB |

Error, éxito, advertencia e información conservan colores semánticos comunes. Si cambias una paleta, vuelve a comprobar contraste de texto, botones y bordes de campos.

`js/tema.js` restaura la preferencia antes de cargar el CSS y sincroniza ambos selectores. Guarda solo el nombre del tema en `papel-luna:tema:v1`. No llama a la API. Si localStorage falla o contiene un nombre desconocido, usa ciruela. Esta preferencia pertenece al navegador, no a un usuario ni a la base de datos.

## Mapa de los cambios de esta iteración

| Archivo | Responsabilidad |
|---|---|
| `css/Style.css` | Paletas, componentes y distribución responsive. Toda la presentación de la aplicación está en CSS. |
| `index.html` | Selectores de tema, composición del login, menú secundario, acceso al carrito y agrupación del historial de compras. Se conservan IDs y formularios de negocio. |
| `js/tema.js` (nuevo) | Preferencia de color y sincronización de selectores. |
| `js/ui.js` | Menú móvil y acceso a la factura. Copia el total ya calculado al resumen móvil; no introduce una fórmula monetaria. |
| `js/historial.js` | Las etiquetas de corrección/reembolso usan clases CSS en lugar de colores inline. |
| `docs/propuestas-visuales.html`, `.css`, `.js` | Maqueta independiente, ahora con CSS y JavaScript externos. No consume datos reales. |
| `tests/run-browser.cjs` | Modo `--visual` para probar temas, persistencia, ausencia de solicitudes al cambiar, desbordamiento y capturas. |

El CSS aplica navegación lateral en escritorio, menú secundario desplegable en móvil, panel de venta con jerarquía de importes y controles, login independiente, compras en columnas y reportes con indicadores en una cuadrícula. Se conserva el contenido de historial y faltantes. En móvil se muestra un acceso al carrito mientras la factura está fuera de la pantalla, sin tapar sus controles.

No se incorporaron campos simulados del PDF (documentos, direcciones, etc.) ni sus fórmulas de demostración. No hubo cambios en API, backend, modelos, cálculos, permisos ni dependencias en esta iteración.

## Verificación

- 16 pruebas Django aprobadas.
- Regresión completa Chrome/Django temporal: 1440 px y 390 px, incluyendo ventas, abiertas, compras, creación contextual, descuentos, roles y borrador.
- Prueba visual: 1440×900, 1024×768, 768×1024, 390×844 y 360×800. Sin desbordamiento del documento en las vistas comprobadas. Las tablas anchas mantienen su desplazamiento dentro de su contenedor.
- Paletas: cambio de variables, sincronización login/cabecera, recuperación tras recarga y cero solicitudes de red causadas por el selector.
- Preferencia inválida y localStorage bloqueado: vuelve a ciruela.
- Sintaxis JavaScript, IDs HTML únicos, referencias locales y ausencia de estilos inline en los dos HTML revisados.

Reproducir con el servidor aislado en una terminal y Chrome en otra:

```bash
python tests/serve-mvp3.py
node tests/run-browser.cjs 390 --visual --height=844
node tests/run-browser.cjs 1440 --mvp3
```

Las capturas se guardan en una carpeta temporal cuya ruta muestra el comando. Se revisaron capturas de POS, factura móvil, login y compras. No se probó un dispositivo físico con teclado virtual ni se desplegó en Render. La prueba visual no certifica todos los estados posibles de cada pantalla.
