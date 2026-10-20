/* ==========================================================
   Envío de registros a la nube (Google Apps Script → Google Sheets en Drive)
   Cada registro se guarda primero en una cola local; si no hay internet
   o la nube no está configurada, se reintenta automáticamente después.
   ========================================================== */
const Nube = (() => {
  const QK = "ci-ensma-nube-pendientes", LK = "ci-ensma-nube-ultimo";
  const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const cola = () => leer(QK) || [];
  const activa = () => typeof CONFIG_NUBE !== "undefined" && /^https:\/\/script\.google(usercontent)?\.com\//.test(CONFIG_NUBE.url || "");
  const oyentes = [];
  let enviando = false, memoria = [];   // respaldo si el navegador bloquea el almacenamiento

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function estado() {
    return { activa: activa(), pendientes: cola().length + memoria.length, ultimo: leer(LK), enLinea: navigator.onLine };
  }
  function avisar() { const e = estado(); oyentes.forEach(f => { try { f(e); } catch (x) {} }); }

  function registrar(tipo, datos) {
    const item = Object.assign({ idRegistro: uid(), tipo, fecha: new Date().toISOString() }, datos);
    const c = cola(); c.push(item); escribir(QK, c);
    if (!cola().some(x => x.idRegistro === item.idRegistro)) memoria.push(item);
    avisar(); enviar();
  }

  async function enviar() {
    if (enviando || !activa() || !navigator.onLine) return;
    enviando = true;
    try {
      while (true) {
        const item = cola()[0] || memoria[0];
        if (!item) break;
        await fetch(CONFIG_NUBE.url, {
          method: "POST", mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ clave: CONFIG_NUBE.clave }, item))
        });
        escribir(QK, cola().filter(x => x.idRegistro !== item.idRegistro));
        memoria = memoria.filter(x => x.idRegistro !== item.idRegistro);
        escribir(LK, new Date().toISOString());
        avisar();
      }
    } catch (e) { /* sin conexión: se reintenta luego */ }
    enviando = false; avisar();
  }

  window.addEventListener("online", enviar);
  setInterval(enviar, 45000);
  setTimeout(enviar, 1500);
  return { registrar, enviar, estado, uid, alCambiar: f => oyentes.push(f) };
})();
