// Inyectado por DevTools exclusivamente contra serve-mvp3.py: API Django real, BD desechable.
(() => {
  window.PAPEL_LUNA_API_URL = 'http://127.0.0.1:8765/api';
  const llamadas = [];
  const fetchReal = window.fetch.bind(window);
  window.fetch = (...args) => { llamadas.push(String(args[0])); return fetchReal(...args); };
  const esperar = async (condicion, mensaje = 'Estado esperado') => {
    for (let i = 0; i < 200; i++) { if (condicion()) return; await new Promise(r => setTimeout(r, 25)); }
    throw Error('Tiempo agotado: ' + mensaje);
  };
  const verificar = (valor, mensaje) => { if (!valor) throw Error(mensaje); };
  const pausa = () => new Promise(r => setTimeout(r, 80));
  document.addEventListener('DOMContentLoaded', async () => {
    const el = id => document.getElementById(id);
    const visible = id => !el(id).classList.contains('hidden');
    const comprobarAncho = vista => verificar(document.documentElement.scrollWidth <= innerWidth, 'Desbordamiento en ' + vista);
    const iniciar = async nombre => {
      await esperar(() => visible('login-modal'), 'login');
      el('login-username').value = nombre; el('login-password').value = 'SoloPruebas123!';
      el('login-form').requestSubmit();
      await esperar(() => window.usuarioActual && window.usuarioActual.username === nombre && catalogoCargado && clientesCargados && !el('btn-login-submit').disabled, 'sesión iniciada');
    };
    const salir = async () => {
      el('btn-logout').click();
      if (factura.length) { await esperar(() => visible('confirmacion-modal')); el('confirmacion-aceptar').click(); }
      await esperar(() => !window.usuarioActual && visible('login-modal'), 'sesión cerrada');
    };
    const buscarCard = id => [...document.querySelectorAll('#historial-container > details')].find(c => c.textContent.includes(referenciaVisible(id, 'VTA')));
    const ajustarPago = metodo => { el('select-pago').value = metodo; el('select-pago').dispatchEvent(new Event('change')); };
    try {
      const etapa = sessionStorage.getItem('ux-etapa');
      if (!etapa) {
        await esperar(() => visible('login-modal'));
        verificar(getComputedStyle(el('session-loading')).display === 'none', 'Comprobación de sesión quedó visible');
        const cuenta = llamadas.length;
        for (const campo of ['login-username', 'login-password']) {
          for (const letra of 'prueba') { el(campo).value += letra; el(campo).dispatchEvent(new Event('input', { bubbles: true })); }
        }
        await pausa(); verificar(llamadas.length === cuenta, 'Escribir en login dispara peticiones');
        verificar(getComputedStyle(el('login-modal')).backdropFilter === 'none', 'Login conserva desenfoque');
        await iniciar('admin_ux');
        comprobarAncho('POS');
        el('btn-nuevo-cliente-pos').focus(); el('btn-nuevo-cliente-pos').click();
        await pausa(); verificar(document.activeElement.id === 'cliente-nombre', 'Modal no enfoca Nombre');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await pausa(); verificar(!visible('cliente-form-modal') && document.activeElement.id === 'btn-nuevo-cliente-pos', 'Escape no devuelve el foco');
        agregarAFactura('ux-prod', 2);
        el('btn-nuevo-cliente-pos').click();
        await esperar(() => visible('cliente-form-modal'));
        el('cliente-nombre').value = 'Cliente contextual'; el('cliente-correo').value = 'cliente@example.test';
        el('cliente-form').requestSubmit(); await esperar(() => !visible('cliente-form-modal'));
        verificar(clientes.find(c => c.id === el('select-cliente').value)?.nombre === 'Cliente contextual', 'Cliente no seleccionado');
        verificar(factura.length === 1 && factura[0].cantidad === 2, 'Carrito perdido al crear cliente');
        const clienteContextual = el('select-cliente').value;
        el('btn-nav-clientes').click();
        comprobarAncho('Clientes');
        const filaCliente = el('clientes-table-body').children[clientes.findIndex(c => c.id === clienteContextual)];
        filaCliente.querySelector('.btn-editar').click(); await pausa();
        verificar(visible('cliente-form-modal') && el('cliente-id').value, 'Edición de cliente no abre modal');
        const antesValidacion = llamadas.length; el('cliente-correo').value = 'correo-invalido'; el('cliente-form').requestSubmit();
        await pausa(); verificar(llamadas.length === antesValidacion && visible('cliente-form-modal'), 'Email inválido se envió o cerró modal');
        el('cliente-correo').value = 'cliente@example.test'; el('cliente-nombre').value = 'Cliente editado';
        el('cliente-form').requestSubmit(); await esperar(() => !visible('cliente-form-modal'));
        el('btn-nav-pos').click(); verificar(el('select-cliente').value === clienteContextual && factura.length === 1, 'Edición perdió cliente/carrito');
        el('btn-nuevo-producto-pos').click();
        el('product-name').value = 'Producto contextual'; el('product-category').value = 'ux-cat';
        el('product-price').value = 500; el('product-cost').value = 100;
        el('track-inventory').checked = true; el('track-inventory').dispatchEvent(new Event('change')); el('product-stock').value = 10;
        el('product-form').requestSubmit();
        await esperar(() => !visible('product-modal') && !productosGuardando);
        verificar(factura.length === 2, 'Producto contextual no disponible en factura');
        el('btn-nav-descuentos').click(); await esperar(() => !el('descuentos-body').querySelector('.skeleton-table'));
        const nombreDescuento = 'Descuento UX ' + Date.now();
        el('descuentos-nombre').value = nombreDescuento; el('descuentos-tipo').value = 'porcentaje'; el('descuentos-valor').value = 5;
        el('descuentos-form').requestSubmit();
        await esperar(() => descuentosCatalogo.some(d => d.nombre === nombreDescuento) && el('descuentos-form').getAttribute('aria-busy') !== 'true');
        const descuentoCreado = descuentosCatalogo.find(d => d.nombre === nombreDescuento);
        el('descuentos-body').querySelector(`.btn-editar[data-id="${descuentoCreado.id}"]`).click();
        el('descuentos-valor').value = 8; el('descuentos-form').requestSubmit();
        await esperar(() => descuentosCatalogo.find(d => d.id === descuentoCreado.id)?.valor === 8);
        el('descuentos-body').querySelector(`.btn-eliminar[data-id="${descuentoCreado.id}"]`).click();
        await esperar(() => visible('confirmacion-modal')); el('confirmacion-aceptar').click();
        await esperar(() => !descuentosCatalogo.some(d => d.id === descuentoCreado.id));
        el('btn-nav-pos').click(); verificar(factura.length === 2, 'Gestión de descuentos perdió el carrito');
        const numeroDescuentos = (await apiGet('descuentos')).length;
        el('btn-descuento-puntual').click(); el('puntual-tipo').value = 'fijo'; el('puntual-valor').value = 999999;
        el('puntual-form').requestSubmit(); await esperar(() => !visible('puntual-modal'));
        verificar(calcularTotalVenta() === 0, 'Descuento fijo no limita total a cero');
        el('select-descuento').value = ''; el('select-descuento').dispatchEvent(new Event('change'));
        verificar(![...el('select-descuento').options].some(o => o.value === '__puntual__'), 'Quedó una opción de descuento puntual sin estado');
        el('btn-descuento-puntual').click(); el('puntual-form').requestSubmit(); await esperar(() => !visible('puntual-modal'));
        verificar((await apiGet('descuentos')).length === numeroDescuentos, 'Descuento puntual creó catálogo');
        ajustarPago('Nequi'); el('btn-finalizar').click();
        await esperar(() => !productosGuardando && !factura.length);
        const venta = (await apiGet('ventas'))[0]; verificar(venta.total === 0 && venta.descuentoNombre === 'Descuento puntual', 'Descuento no persistió en venta');
        el('btn-nav-historial').click(); await esperar(() => !historialEnCarga && buscarCard(venta.id));
        comprobarAncho('Historial');
        verificar(!buscarCard(venta.id).open, 'Historial no inicia compacto');
        for (let i = 0; i < 2; i++) {
          const card = buscarCard(venta.id); card.open = true;
          [...card.querySelectorAll('button')].find(b => b.textContent === 'Corregir').click();
          await esperar(() => ventaEnCorreccion?.id === venta.id, 'modo corrección');
          cambiarCantidad('ux-prod', i === 0 ? 1 : -1);
          el('btn-finalizar').click(); await esperar(() => !productosGuardando && !ventaEnCorreccion && !historialEnCarga, 'corrección terminada');
          verificar(!el('btn-finalizar').disabled, 'Finalizar quedó bloqueado');
        }
        const corregida = await apiGet(`ventas/${venta.id}`);
        verificar(corregida.corregida && corregida.descuentoValor === 999999, 'Corrección perdió historial del descuento');
        const abrirVentana = window.open; let ticket = '';
        window.open = () => ({ document: { write: html => ticket = html, close() {} }, focus() {} });
        try { imprimirFactura(corregida); } finally { window.open = abrirVentana; }
        verificar(ticket.includes('VENTA CORREGIDA') && ticket.includes('Descuento puntual'), 'Factura perdió corrección o descuento');
        // Reembolso sobre una venta normal, para comprobar el bloqueo explicado de Corregir.
        const reembolsable = await apiPost('ventas', 'create', { estado: 'cerrada', metodoPago: 'Nequi', items: [{ productoId: 'ux-prod', cantidad: 1 }] });
        await renderHistorial(true); const card = buscarCard(reembolsable.id); card.open = true;
        [...card.querySelectorAll('button')].find(b => b.textContent === 'Reembolsar').click();
        await esperar(() => visible('reembolso-modal'));
        const cantidad = document.querySelector('.reembolso-cant-input'); cantidad.value = 1; cantidad.dispatchEvent(new Event('input'));
        el('reembolso-retorna-stock').checked = true; el('reembolso-form').requestSubmit();
        await esperar(() => !visible('reembolso-modal') && buscarCard(reembolsable.id)?.querySelector('.btn-editar')?.disabled, 'historial actualizado tras reembolso');
        const bloqueada = buscarCard(reembolsable.id); bloqueada.open = true;
        const botonCorregir = [...bloqueada.querySelectorAll('button')].find(b => b.textContent === 'Corregir');
        verificar(botonCorregir.disabled && getComputedStyle(botonCorregir).cursor === 'not-allowed' && botonCorregir.title.includes('reembolsos'), 'Bloqueo de corrección sin explicación');
        // Compras conserva creación contextual y múltiples líneas.
        el('btn-nav-compras').click(); await esperar(() => !gestiones.proveedores.cargando);
        comprobarAncho('Compras');
        el('compra-producto').value = 'ux-prod'; el('compra-costo').value = 60; el('compra-cantidad').value = 2; el('btn-agregar-compra').click();
        el('btn-nuevo-proveedor-compra').click(); el('nuevo-proveedor-nombre').value = 'Proveedor contextual';
        el('nuevo-proveedor-form').requestSubmit(); await esperar(() => !visible('nuevo-proveedor-modal'));
        verificar(lineasCompra.length === 1 && el('compra-proveedor').value, 'Proveedor contextual perdió compra');
        const proveedorContextual = el('compra-proveedor').value;
        el('compra-producto').value = 'ux-servicio'; el('compra-costo').value = 20; el('compra-cantidad').value = 3; el('btn-agregar-compra').click();
        el('compra-form').requestSubmit(); await esperar(() => !productosGuardando && !lineasCompra.length);
        verificar((await apiGet('compras'))[0].items.length === 2, 'Compra perdió líneas');
        el('btn-nav-proveedores').click(); await esperar(() => !gestiones.proveedores.cargando);
        const filaProveedor = [...el('proveedores-body').children].find(f => f.textContent.includes(referenciaVisible(proveedorContextual, 'PRV')));
        filaProveedor.querySelector('.btn-editar').click(); await pausa();
        verificar(visible('proveedores-form-modal') && el('proveedores-id').value === proveedorContextual, 'Proveedor no abrió edición con mismo ID');
        el('proveedores-nombre').value = 'Proveedor editado'; el('proveedores-form').requestSubmit();
        await esperar(() => !visible('proveedores-form-modal'));
        verificar((await apiGet(`proveedores/${proveedorContextual}`)).nombre === 'Proveedor editado', 'Edición proveedor no persistió');
        el('btn-nav-faltantes').click(); await pausa();
        el('faltante-tipo').value = 'inexistente'; el('faltante-tipo').dispatchEvent(new Event('change'));
        verificar(el('grupo-faltante-producto').hidden && !el('grupo-faltante-descripcion').hidden, 'Faltantes muestra ambos campos');
        el('faltante-descripcion').value = '<img src=x onerror="window.xssPrueba=true"> Marcador'; el('faltante-cantidad').value = 3;
        el('faltante-form').requestSubmit(); await esperar(() => el('faltante-form').getAttribute('aria-busy') !== 'true');
        verificar(!window.xssPrueba && !document.querySelector('#faltantes-agrupados-body img'), 'Contenido de faltante se interpretó como HTML');
        el('faltante-tipo').value = 'agotado'; el('faltante-tipo').dispatchEvent(new Event('change'));
        el('faltante-producto').value = 'ux-agotado'; el('faltante-cantidad').value = 2; el('faltante-proveedor').value = proveedorContextual;
        el('faltante-form').requestSubmit(); await esperar(() => el('faltante-form').getAttribute('aria-busy') !== 'true');
        verificar((await apiGet('faltantes')).some(f => f.tipo === 'agotado' && f.productoId === 'ux-agotado'), 'No se registró el faltante agotado');
        el('filtro-faltante-tipo').value = 'inexistente'; el('filtro-faltante-tipo').dispatchEvent(new Event('change'));
        await esperar(() => llamadas.some(url => url.includes('/faltantes/?tipo=inexistente')));
        await esperar(() => !el('faltantes-table-body').querySelector('.skeleton-table'));
        verificar([...el('faltantes-table-body').children].every(tr => tr.children[2].textContent === 'inexistente'), 'Filtro por tipo no se aplica a los resultados');
        el('filtro-faltante-tipo').value = ''; el('filtro-faltante-proveedor').value = proveedorContextual;
        el('filtro-faltante-proveedor').dispatchEvent(new Event('change'));
        await esperar(() => !el('faltantes-table-body').querySelector('.skeleton-table'));
        verificar(el('faltantes-table-body').children.length > 0 && [...el('faltantes-table-body').children].every(tr => tr.children[4].textContent === 'Proveedor editado'), 'Filtro de proveedor no se aplica');
        el('btn-nav-reportes').click(); await esperar(() => el('reportes-resumen-cards').querySelectorAll('article').length === 2);
        comprobarAncho('Reportes');
        verificar(llamadas.some(url => url.includes('/reportes/?fechaInicio=')), 'El loader perdió los parámetros del reporte');
        const fetchAntes = window.fetch;
        window.fetch = (url, opts) => String(url).includes('auth/logout') ? Promise.reject(Error('Fallo simulado de red')) : fetchAntes(url, opts);
        el('btn-logout').click(); await esperar(() => !el('btn-logout').disabled);
        verificar(window.usuarioActual?.esAdmin && !visible('login-modal'), 'Fallo de logout ocultó sesión activa'); window.fetch = fetchAntes;
        await salir(); await iniciar('cajero_ux');
        verificar(el('btn-nuevo-producto-pos').classList.contains('hidden'), 'Cajero ve creación de producto');
        document.querySelector('#product-grid .btn-editar').click();
        verificar(visible('product-modal') && el('product-stock').disabled, 'Edición en caliente del cajero incorrecta');
        el('product-price').value = 150; el('product-form').requestSubmit(); await esperar(() => !visible('product-modal'));
        let denegado = false; try { await apiPost('productos', 'update', { id: 'ux-prod', stock: 999 }); } catch { denegado = true; }
        verificar(denegado, 'Backend deja al cajero editar inventario');
        agregarAFactura('ux-prod', 1); ajustarPago('Nequi'); el('select-descuento').value = 'ux-desc'; el('select-descuento').dispatchEvent(new Event('change'));
        el('btn-guardar-abierta').click(); await esperar(() => !productosGuardando && !factura.length);
        const abierta = (await apiGet('ventas')).find(v => v.estado === 'abierta');
        verificar(abierta, 'No guardó abierta'); sessionStorage.setItem('ux-abierta', abierta.id);
        sessionStorage.setItem('ux-etapa', 'abierta'); location.reload(); return;
      }
      await esperar(() => window.usuarioActual && catalogoCargado && clientesCargados, 'sesión tras recarga');
      if (etapa === 'abierta') {
        verificar(!factura.length && !visible('confirmacion-modal'), 'Borrador duplicado tras guardar abierta');
        const id = sessionStorage.getItem('ux-abierta'); await retomarVentaAbierta(id);
        ajustarPago('Nequi'); el('btn-finalizar').click(); await esperar(() => !productosGuardando && !factura.length);
        const cerrada = await apiGet(`ventas/${id}`); verificar(cerrada.estado === 'cerrada' && cerrada.id === id && cerrada.total === 129, 'Cierre de abierta alteró identidad o importes');
        agregarAFactura('ux-prod', 2); agregarAFactura('ux-servicio', 1);
        sessionStorage.setItem('ux-etapa', 'borrador'); location.reload(); return;
      }
      await esperar(() => visible('confirmacion-modal'), 'recuperación de borrador');
      verificar(document.activeElement.id === 'confirmacion-cancelar', 'Confirmación no enfoca Cancelar');
      el('confirmacion-aceptar').click(); await esperar(() => factura.length === 2);
      el('btn-vaciar').click(); verificar(!localStorage.getItem(claveBorradorUsuario(CLAVE_BORRADOR_VENTA)), 'Vaciar no limpió borrador');
      el('btn-nav-faltantes').click(); await esperar(() => !document.querySelector('#faltantes-agrupados-body .skeleton-table'));
      verificar(document.documentElement.scrollWidth <= innerWidth, 'Desbordamiento horizontal');
      verificar(!window.xssPrueba, 'XSS durante la sesión');
      document.body.dataset.prueba = 'PASS'; el('notificacion').classList.add('hidden');
    } catch (error) {
      document.body.dataset.prueba = 'FAIL';
      document.body.dataset.errorPrueba = error.message + ' | ' + (el('notificacion')?.textContent || '');
      console.error(error);
    }
  });
})();
