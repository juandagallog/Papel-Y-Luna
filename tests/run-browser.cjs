// Ejecutar: node tests/run-browser.cjs 390 (o 1366).
// Usa Chrome instalado y DevTools/WebSocket de Node; no instala dependencias.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const width = Number(process.argv[2] || 1366);
const mvp3 = process.argv.includes('--mvp3');
const visual = process.argv.includes('--visual');
const height = Number(process.argv.find(a => a.startsWith('--height='))?.split('=')[1] || 900);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'papel-luna-test-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<head>', `<head><base href="${pathToFileURL(root + path.sep).href}">`)
  .replace('<script src="js/api.js" defer></script>', '<script src="tests/browser-post-mvp2.js"></script><script src="js/api.js" defer></script>');
const fixture = path.join(temp, 'preview.html'); fs.writeFileSync(fixture, html);
const browser = spawn(chrome, ['--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${temp}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
(async () => {
  const portFile = path.join(temp, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(50);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let sequence = 0; const pending = new Map(); const errores = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errores.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const task = pending.get(message.id);
    if (task) { clearTimeout(task.timer); pending.delete(message.id); message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('DevTools agotó el tiempo: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  if (mvp3 && !visual) await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'browser-mvp3.js'), 'utf8') });
  if (visual) await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.PAPEL_LUNA_API_URL = 'http://127.0.0.1:8765/api';" });
  await send('Page.navigate', { url: mvp3 || visual ? 'http://127.0.0.1:8765/' : pathToFileURL(fixture).href });
  if (visual) {
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const until = async expression => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); }
      throw Error('No se cumplió: ' + expression);
    };
    const capture = async name => {
      const dims = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight})');
      if (dims.scrollWidth > dims.width) throw Error('Desbordamiento: ' + name + JSON.stringify(dims));
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(temp, `${name}-${width}.png`), Buffer.from(shot.data, 'base64'));
    };
    await until('document.body?.dataset.sesion === "no"');
    await evaluate(`window.peticionesTema = 0; const fetchOriginalTema = window.fetch; window.fetch = (...args) => { window.peticionesTema++; return fetchOriginalTema(...args); };`);
    await capture('login-ciruela');
    for (const tema of ['terracota', 'tinta', 'ciruela']) {
      const expected = { terracota: '#913F2D', tinta: '#274961', ciruela: '#593C56' }[tema];
      await evaluate(`document.querySelector('#login-modal [data-selector-tema]').value = '${tema}'; document.querySelector('#login-modal [data-selector-tema]').dispatchEvent(new Event('change'));`);
      if ((await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()')) !== expected) throw Error('Paleta incorrecta: '+tema);
      if (!(await evaluate(`Array.from(document.querySelectorAll('[data-selector-tema]')).every(s=>s.value==='${tema}')`))) throw Error('Selectores no sincronizados');
      await capture('login-'+tema);
    }
    if (await evaluate('window.peticionesTema')) throw Error('Cambiar tema generó peticiones');
    await evaluate(`document.querySelector('#login-modal [data-selector-tema]').value = 'tinta'; document.querySelector('#login-modal [data-selector-tema]').dispatchEvent(new Event('change'));`);
    await send('Page.reload'); await sleep(250); await until('document.body?.dataset.sesion === "no"');
    if (await evaluate('document.documentElement.dataset.tema') !== 'tinta') throw Error('No persiste el tema');
    await evaluate(`document.querySelector('#login-modal [data-selector-tema]').value = 'ciruela'; document.querySelector('#login-modal [data-selector-tema]').dispatchEvent(new Event('change')); document.getElementById('login-username').value='admin_ux'; document.getElementById('login-password').value='SoloPruebas123!'; document.getElementById('login-form').requestSubmit();`);
    await until('window.usuarioActual && catalogoCargado && clientesCargados');
    await capture('pos-vacio');
    await evaluate(`agregarAFactura('ux-prod',1); agregarAFactura('ux-servicio',2);`);
    await capture('pos-productos');
    if (width < 900) {
      await evaluate(`document.getElementById('acceso-venta-movil').click()`);
      await capture('factura-movil');
      if (!(await evaluate(`document.getElementById('total-venta-movil').textContent === document.getElementById('total-valor').textContent`))) throw Error('Total móvil desactualizado');
    }
    await evaluate(`document.getElementById('btn-nuevo-cliente-pos').click()`);
    await capture('modal-cliente');
    await evaluate(`cerrarFormularioModal('cliente-form'); document.getElementById('btn-nav-compras').click(); window.scrollTo(0,0);`);
    await until(`!document.querySelector('#compras-lista .skeleton-group')`);
    await capture('compras');
    await evaluate(`document.getElementById('btn-nav-reportes').click(); window.scrollTo(0,0);`);
    await capture('reportes');
    if (errores.length) throw Error(JSON.stringify(errores));
    console.log(JSON.stringify({ status: 'PASS', width, height, screenshots: temp, comprobaciones: 'temas, persistencia, cero peticiones al cambiar, POS, modal, compras, reportes, desbordamiento' }));
    return;
  }
  let result;
  for (let i = 0; i < 1200; i++) {
    const evaluated = await send('Runtime.evaluate', { expression: 'JSON.stringify({status:document.body?.dataset.prueba,error:document.body?.dataset.errorPrueba,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})', returnByValue: true });
    result = JSON.parse(evaluated.result.value || '{}');
    if (result.status) break;
    await sleep(50);
  }
  if (result.status !== 'PASS' || result.width !== width) throw Error(JSON.stringify({ ...result, errores }));
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: result.height, scale: 1 } });
  const screenshot = path.join(temp, `compras-${width}.png`); fs.writeFileSync(screenshot, Buffer.from(image.data, 'base64'));
  console.log(JSON.stringify({ ...result, screenshot }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { if (ws) ws.close(); browser.kill(); });
