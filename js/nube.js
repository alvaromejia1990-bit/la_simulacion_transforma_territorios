/* ==========================================================
   Envío de registros a la nube (Google Apps Script → Google Sheets en Drive)
   Cada registro se guarda primero en una cola local; si no hay internet
   o la nube no está configurada, se reintenta automáticamente después.
   ========================================================== */
const Nube = (() => {
  const QK = "ci-ensma-nube-pendientes", LK = "ci-ensma-nube-ultimo", CK = "ci-ensma-nube-confirmados";
  const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const cola = () => leer(QK) || [];
  const activa = () => typeof CONFIG_NUBE !== "undefined" && /^https:\/\/script\.google(usercontent)?\.com\//.test(CONFIG_NUBE.url || "");
  const oyentes = [];
  let enviando = false, memoria = [], ultimoError = null, tiposFallidos = [];   // respaldo si el navegador bloquea el almacenamiento

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function estado() {
    return { activa: activa(), pendientes: cola().length + memoria.length, ultimo: leer(LK), enLinea: navigator.onLine, error: ultimoError,
      tipos: [...new Set(cola().concat(memoria).map(x => x.tipo))] };
  }
  function avisar() { const e = estado(); oyentes.forEach(f => { try { f(e); } catch (x) {} }); }

  const confirmados = () => leer(CK) || [];
  const confirmado = id => confirmados().includes(id);
  function marcarConfirmado(id) {
    const c = confirmados(); if (c.includes(id)) return;
    c.push(id); escribir(CK, c.slice(-1000));
  }

  function registrar(tipo, datos) {
    const item = Object.assign({ tipo, fecha: new Date().toISOString() }, datos);
    if (!item.idRegistro) item.idRegistro = uid();
    if (confirmado(item.idRegistro)) return;
    const c = cola();
    if (c.some(x => x.idRegistro === item.idRegistro)) { enviar(); return; }
    c.push(item); escribir(QK, c);
    if (!cola().some(x => x.idRegistro === item.idRegistro)) memoria.push(item);
    avisar(); enviar();
  }

  // JSONP contra doGet (permite leer la respuesta de Google)
  function jsonp(params) {
    return new Promise(res => {
      const cb = "racr" + Date.now() + Math.floor(Math.random() * 1e6);
      const sc = document.createElement("script");
      const fin = r => { clearTimeout(t); delete window[cb]; sc.remove(); res(r); };
      const t = setTimeout(() => fin(null), 20000);
      window[cb] = d => fin(d);
      sc.onerror = () => fin(null);
      const q = new URLSearchParams(Object.assign({ callback: cb }, params));
      sc.src = CONFIG_NUBE.url + (CONFIG_NUBE.url.includes("?") ? "&" : "?") + q;
      document.head.append(sc);
    });
  }

  const esperar = ms => new Promise(r => setTimeout(r, ms));

  async function enviar() {
    if (enviando || !activa() || !navigator.onLine) return;
    enviando = true; ultimoError = null;
    try {
      const lote = cola().concat(memoria);
      const fallidos = [];
      for (const item of lote) {
        const cuerpo = JSON.stringify(Object.assign({ clave: CONFIG_NUBE.clave }, item));
        let r = null;
        if (encodeURIComponent(cuerpo).length < 6500) {
          // Canal principal: GET con respuesta legible (la misma vía de «Probar conexión»)
          r = await jsonp({ datos: cuerpo });
        } else {
          // Registros muy largos: POST y luego verificación
          await fetch(CONFIG_NUBE.url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: cuerpo });
          let v = await jsonp({ verificar: item.idRegistro });
          if (!v || !v.existe) { await esperar(3000); v = await jsonp({ verificar: item.idRegistro }); }
          r = v ? (v.existe ? { ok: true } : { ok: false, error: "Google no confirmó el guardado" }) : null;
        }
        if (r && r.ok) {
          marcarConfirmado(item.idRegistro);
          escribir(QK, cola().filter(x => x.idRegistro !== item.idRegistro));
          memoria = memoria.filter(x => x.idRegistro !== item.idRegistro);
          escribir(LK, new Date().toISOString());
        } else {
          ultimoError = r ? (r.error || "no-confirmado") : "sin-respuesta";
          fallidos.push(item.tipo);
          if (!r) break;            // Google no responde: se reintenta más tarde
        }
        avisar();
      }
      tiposFallidos = fallidos;
    } catch (e) { ultimoError = "sin-conexion"; }
    enviando = false; avisar();
  }

  window.addEventListener("online", enviar);
  // Al cerrar o salir de la página, intenta entregar lo pendiente (Google descarta duplicados);
  // la confirmación se hace en la siguiente visita.
  window.addEventListener("pagehide", () => {
    if (!activa() || !navigator.sendBeacon) return;
    cola().concat(memoria).slice(0, 20).forEach(item => {
      try { navigator.sendBeacon(CONFIG_NUBE.url, new Blob([JSON.stringify(Object.assign({ clave: CONFIG_NUBE.clave }, item))], { type: "text/plain;charset=utf-8" })); } catch (e) {}
    });
  });
  setInterval(enviar, 45000);
  setTimeout(enviar, 1500);
  // Prueba la conexión con JSONP (doGet con callback): devuelve la hoja de cálculo conectada
  async function probar() {
    if (typeof CONFIG_NUBE === "undefined" || !CONFIG_NUBE.url) return { ok: false, motivo: "sin-url" };
    if (!activa()) return { ok: false, motivo: "url-invalida" };
    const d = await jsonp({});
    return d ? Object.assign({ ok: !!d.ok }, d) : { ok: false, motivo: "sin-respuesta" };
  }

  // Descarta los registros pendientes (solo si el docente lo decide)
  function descartar() { escribir(QK, []); memoria = []; avisar(); }

  // Consulta del panel de administrador (requiere la clave de administrador definida en Apps Script)
  async function admin(clave, extra) {
    if (!activa()) return { ok: false, error: "La nube no está configurada en js/config.js" };
    const d = await jsonp(Object.assign({ admin: clave }, extra || {}));
    return d || { ok: false, error: "Google no respondió" };
  }

  // Registro de visitas (no bloquea nada; si el script no lo reconoce, simplemente responde «ok»)
  function visita(seccion) {
    if (!activa() || !navigator.onLine) return;
    let id = leer("ci-ensma-visitante");
    if (!id) { id = uid(); escribir("ci-ensma-visitante", id); }
    jsonp({ visita: seccion, visitante: id });
  }

  // Cuenta del estudiante (usuario/contraseña). Devuelve null si no hay conexión o el script no la soporta.
  async function cuenta(p) {
    if (!activa() || !navigator.onLine || !p || !p.id) return null;
    const d = await jsonp({ cuenta: p.id, clave: CONFIG_NUBE.clave, nombre: p.nombre, grado: p.grado, curso: p.curso });
    return d && d.usuario ? { usuario: d.usuario, contrasena: d.contrasena } : null;
  }
  async function login(usuario, contrasena) {
    if (!activa()) return { ok: false, error: "La nube no está configurada" };
    if (!navigator.onLine) return { ok: false, error: "Necesitas conexión a internet para ingresar" };
    const d = await jsonp({ login: usuario, contrasena });
    if (!d) return { ok: false, error: "No fue posible conectar con el servidor. Intenta de nuevo." };
    if (d.ok === true && !d.perfil) return { ok: false, error: "El ingreso con usuario aún no está activo. Avísale a tu docente." };
    return d;
  }
  const marcar = ids => ids.forEach(marcarConfirmado);

  return { registrar, enviar, estado, uid, probar, descartar, admin, confirmado, visita, cuenta, login, marcar, alCambiar: f => oyentes.push(f) };
})();
