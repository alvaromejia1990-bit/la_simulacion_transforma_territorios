/* ==========================================================
   Lógica del sitio: navegación, diagnóstico, retos, seguimiento
   ========================================================== */
(function () {
  "use strict";

  /* ---------- Almacenamiento local (solo en este navegador) ---------- */
  const KEY = "ci-ensma-simulacion-v1";
  function cargar() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  let S = Object.assign({ perfil: null, diag: {}, retos: {}, sims: {} }, cargar());
  function guardar() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* almacenamiento no disponible */ }
  }

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600);
  }

  function estudiante() {
    const p = S.perfil || {};
    return { idEstudiante: p.id || "", nombre: p.nombre || "", grado: p.grado || "", curso: p.curso || "" };
  }
  const nombreNivel = n => `${n.nombre} (${n.grados})`;
  // Identificadores fijos: el mismo registro siempre tiene el mismo id (la hoja nunca lo duplica)
  const hash = t => [...String(t)].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(36);
  const camposCar = p => [p.nombre, p.grado, p.curso, p.edad, p.dispositivo, p.internet].concat(p.zona || p.conectividad || p.problematica ? [p.zona, p.conectividad, p.problematica] : []);
  const idCar = p => "car-" + p.id + "-" + hash(camposCar(p).join("|"));
  const datosCar = p => ({ idRegistro: idCar(p), edad: p.edad, dispositivo: p.dispositivo, internet: p.internet,
    zona: p.zona || "", conectividad: p.conectividad || "", problematica: p.problematica || "" });
  const idDia = (p, nv, fecha) => "dia-" + p.id + "-" + nv.id + "-" + fecha;
  const idRetoOk = (p, rid) => "ret-" + p.id + "-" + rid;

  const notaDe = pct => Math.round((1 + 4 * pct) * 10) / 10;
  const desempeno = nota => ESCALA.find(e => nota >= e.min);
  const badge = nota => { const d = desempeno(nota); return `<span class="desemp d-${d.clase}">${d.nombre}</span>`; };

  /* ---------- Perfil del estudiante (caracterización obligatoria + cuenta) ---------- */
  const CAMPOS_OBLIG = ["nombre", "grado", "curso", "edad", "dispositivo", "internet", "zona", "conectividad", "problematica"];
  const cursoValido = c => /^0[1-5]$/.test(String(c || ""));
  // Convierte cursos antiguos («902», «1002», «2») al formato de la lista (01 a 05)
  function cursoNorm(g, c) {
    let x = String(c ?? "").replace(/\D/g, "");
    if (x.length > 2 && x.indexOf(String(g)) === 0) x = x.slice(String(g).length);
    return x ? ("0" + Number(x)).slice(-2) : "";
  }
  const perfilCompleto = p => !!p && CAMPOS_OBLIG.every(k => String(p[k] ?? "").trim() !== "") && cursoValido(p.curso);
  const nivelDe = g => NIVELES.find(n => n.gradosNum.includes(Number(g))) || null;
  const miNivel = () => (perfilCompleto(S.perfil) ? nivelDe(S.perfil.grado) : null);
  if (S.perfil && !cursoValido(S.perfil.curso)) { const c = cursoNorm(S.perfil.grado, S.perfil.curso); if (cursoValido(c)) { S.perfil.curso = c; guardar(); } }

  // Ejecuta la acción solo si la caracterización está completa; si no, abre el formulario
  function conPerfil(cb) {
    if (perfilCompleto(S.perfil)) return cb();
    if (S.perfil) toast("Completa todas las casillas de tu caracterización");
    pedirPerfil(cb);
  }

  let perfilCallback = null;
  function pedirPerfil(cb) {
    perfilCallback = cb || null;
    const f = $("#perfilForm");
    if (S.perfil) {
      const p = S.perfil;
      f.nombre.value = p.nombre || ""; f.grado.value = p.grado || ""; f.curso.value = cursoValido(p.curso) ? p.curso : "";
      f.edad.value = p.edad || ""; f.dispositivo.value = p.dispositivo || ""; f.internet.value = p.internet || "";
      f.zona.value = p.zona || ""; f.conectividad.value = p.conectividad || ""; f.problematica.value = p.problematica || "";
    }
    $("#perfilDlg").showModal();
  }
  $("#perfilForm").addEventListener("submit", e => {
    const f = e.target;
    const datos = Object.fromEntries(CAMPOS_OBLIG.map(k => [k, String(f[k].value).trim()]));
    if (!perfilCompleto(datos)) { e.preventDefault(); toast("Todas las casillas son obligatorias"); return; }
    const antes = S.perfil || {};
    S.perfil = Object.assign({}, antes, datos, { id: antes.id || Nube.uid(), grado: +datos.grado });
    guardar();
    Nube.registrar("caracterizacion", Object.assign(estudiante(), datosCar(S.perfil)));
    toast("Caracterización guardada");
    aplicarNivel(); renderProgreso();
    const cb = perfilCallback; perfilCallback = null;
    asegurarCuenta(true).then(() => {
      const mio = miNivel();
      // Si el estudiante iba a trabajar en otro nivel, se lleva al suyo
      if (mio && /^#nivel-/.test(location.hash) && location.hash !== "#nivel-" + mio.id) { location.hash = "#nivel-" + mio.id; return; }
      if (cb) cb();
    });
  });
  $("#perfilCancel").addEventListener("click", () => { perfilCallback = null; $("#perfilDlg").close(); });

  // Asigna (o recupera) usuario y contraseña desde el servidor
  async function asegurarCuenta(mostrar) {
    if (!perfilCompleto(S.perfil) || S.perfil.usuario) return;
    const c = await Nube.cuenta(S.perfil);
    if (!c) { if (mostrar) toast("Tu usuario y contraseña se asignarán cuando haya conexión"); return; }
    S.perfil.usuario = c.usuario; S.perfil.contrasena = c.contrasena; guardar(); renderProgreso();
    await mostrarCredenciales();
  }
  function mostrarCredenciales() {
    return new Promise(res => {
      $("#credUsuario").textContent = S.perfil.usuario; $("#credClave").textContent = S.perfil.contrasena;
      const d = $("#credDlg"); d.addEventListener("close", () => res(), { once: true }); d.showModal();
    });
  }

  // Ingreso con usuario y contraseña (desde cualquier dispositivo)
  function abrirLogin() {
    if ($("#perfilDlg").open) $("#perfilDlg").close();
    $("#loginMsg").className = "fb mal"; $("#loginForm").reset(); $("#loginDlg").showModal();
  }
  $("#irLogin").addEventListener("click", abrirLogin);
  $("#loginCancel").addEventListener("click", () => $("#loginDlg").close());
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, msg = $("#loginMsg"), btn = $('button[type="submit"]', f);
    btn.disabled = true; msg.className = "fb pista on"; msg.textContent = "Verificando…";
    const r = await Nube.login(f.usuario.value, f.contrasena.value);
    btn.disabled = false;
    if (!r.ok) { msg.className = "fb mal on"; msg.textContent = r.error || "Usuario o contraseña incorrectos"; return; }
    cargarDesdeServidor(r, f.contrasena.value.trim().toLowerCase());
    $("#loginDlg").close();
    toast(`¡Hola, ${S.perfil.nombre.split(" ")[0]}!`);
    if (!perfilCompleto(S.perfil)) pedirPerfil();
    location.hash = "#progreso"; renderProgreso();
  });

  // Reconstruye el perfil y los resultados del estudiante a partir de la hoja de cálculo
  function cargarDesdeServidor(r, contrasena) {
    const p = r.perfil, L = "ABCD";
    const perfil = { id: p.id, nombre: String(p.nombre || ""), grado: +p.grado, curso: cursoNorm(p.grado, p.curso), edad: String(p.edad ?? ""),
      dispositivo: String(p.dispositivo || ""), internet: String(p.internet || ""), zona: String(p.zona || ""), conectividad: String(p.conectividad || ""),
      problematica: String(p.problematica || ""), usuario: r.usuario, contrasena };
    const N = { perfil, diag: {}, retos: {}, sims: {}, intentos: {}, escenarios: 0 };
    const confirmados = [];
    (r.diagnosticos || []).forEach(d => {
      const nv = NIVELES.find(n => nombreNivel(n) === d.nivel); if (!nv) return;
      confirmados.push(idDia(perfil, nv, d.fecha));
      if (N.diag[nv.id] && N.diag[nv.id].fecha > d.fecha) return;
      const resp = Array(nv.diagnostico.length).fill(null);
      String(d.respuestas || "").split(" ").forEach(t => { const m = t.match(/^(\d+):([A-D-])/); if (m && m[2] !== "-") resp[+m[1] - 1] = L.indexOf(m[2]); });
      N.diag[nv.id] = { fecha: d.fecha, aciertos: +d.aciertos, total: +d.total || nv.diagnostico.length, nota: +d.nota,
        comp: Object.fromEntries(Object.keys(COMPETENCIAS).map(k => [k, (+d.comp[k] || 0) / 100])), respuestas: resp };
    });
    (r.retos || []).forEach(x => {
      const nid = String(x.reto).slice(0, 2);
      N.intentos[x.reto] = Math.max(N.intentos[x.reto] || 0, +x.intento || 0);
      if (x.correcta === "Sí") { (N.retos[nid] = N.retos[nid] || []); if (!N.retos[nid].includes(x.reto)) N.retos[nid].push(x.reto); confirmados.push(idRetoOk(perfil, x.reto)); }
    });
    (r.simulaciones || []).forEach(x => { const nv = NIVELES.find(n => nombreNivel(n) === x.nivel); if (nv) { N.sims[nv.id] = true; N.escenarios++; } });
    if (perfilCompleto(perfil)) confirmados.push(idCar(perfil));
    S = N; guardar(); Nube.marcar(confirmados);
    NIVELES.forEach(n => { renderDiagInicio(n); renderRetos(n); });
    aplicarNivel();
  }

  function cerrarSesion() {
    const pend = Nube.estado().pendientes;
    if (!confirm(pend ? `Hay ${pend} registro(s) aún sin enviar; se enviarán cuando haya conexión. ¿Cerrar sesión en este dispositivo?` : "¿Cerrar sesión en este dispositivo? Tus resultados quedan guardados en la base de datos.")) return;
    S = { perfil: null, diag: {}, retos: {}, sims: {}, intentos: {} }; guardar();
    NIVELES.forEach(n => { renderDiagInicio(n); renderRetos(n); });
    aplicarNivel(); renderProgreso(); toast("Sesión cerrada");
  }

  // Solo se habilitan los recursos del nivel que corresponde al grado registrado
  function aplicarNivel() {
    const mio = miNivel();
    $$(".nav a.lv").forEach(a => a.classList.toggle("oculto", !!mio && a.getAttribute("href") !== "#nivel-" + mio.id));
    $$("#nivelCards .ncard").forEach(c => {
      const id = c.getAttribute("href").replace("#nivel-", "");
      c.classList.toggle("mio", !!mio && id === mio.id);
      c.classList.toggle("bloq", !!mio && id !== mio.id);
      const m = $(".marca", c); if (m) { m.hidden = !mio; m.textContent = mio && id === mio.id ? "Tu nivel" : "No corresponde a tu grado"; }
    });
  }

  /* ---------- Tarjetas de nivel en inicio ---------- */
  $("#nivelCards").innerHTML = NIVELES.map(n => `
    <a class="ncard" href="#nivel-${n.id}">
      <div class="ncard-top bg-${n.color}" data-num="${n.numero}">
        <small>Grados <span class="grados">${n.grados}</span></small>
        <h3>${n.nombre}</h3>
      </div>
      <div class="ncard-body">
        <span class="marca" hidden></span>
        <b>${n.tema}</b>
        <p>${n.descripcion}</p>
        <div class="espacios"><span>Diagnóstico</span><span>${n.retos.length} retos</span><span>Simulación</span></div>
      </div>
    </a>`).join("");

  $$("#nivelCards .ncard").forEach(c => c.addEventListener("click", e => {
    if (c.classList.contains("bloq")) { e.preventDefault(); toast("Este nivel no corresponde a tu grado"); }
  }));

  /* ---------- Vistas de nivel ---------- */
  const ICON = {
    diag: '<svg viewBox="0 0 24 24"><path d="M9 4h6v3H9zM7 5H5v16h14V5h-2"/><path d="m9 13 2 2 4-4"/></svg>',
    retos: '<svg viewBox="0 0 24 24"><path d="M6 3h12v5a6 6 0 0 1-12 0V3Z"/><path d="M12 14v4M8 21h8M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/></svg>',
    sim: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>'
  };
  $("#nivelesViews").innerHTML = NIVELES.map(n => `
    <section id="nivel-${n.id}" class="view" data-nivel="${n.id}">
      <div class="lv-head bg-${n.color}" data-num="${n.numero}">
        <div class="wrap">
          <p class="eyebrow">Grados ${n.grados}</p>
          <h1>${n.nombre} · ${n.tema}</h1>
          <p>${n.descripcion}</p>
          <div class="tabs" role="tablist">
            <button class="tab" role="tab" data-tab="diag" aria-selected="true">${ICON.diag}Diagnóstico</button>
            <button class="tab" role="tab" data-tab="retos" aria-selected="false">${ICON.retos}Retos</button>
            <button class="tab" role="tab" data-tab="sim" aria-selected="false">${ICON.sim}Simulaciones</button>
          </div>
        </div>
      </div>
      <div class="wrap">
        <div class="panel on" data-panel="diag"></div>
        <div class="panel" data-panel="retos"></div>
        <div class="panel" data-panel="sim"></div>
      </div>
    </section>`).join("");

  NIVELES.forEach(n => {
    const sec = $("#nivel-" + n.id);
    $$(".tab", sec).forEach(b => b.addEventListener("click", () => mostrarTab(n.id, b.dataset.tab)));
    renderDiagInicio(n);
    renderRetos(n);
    const simHost = $('[data-panel="sim"]', sec);
    SIMULACIONES[n.id](simHost, () => {
      if (!S.sims[n.id]) { S.sims[n.id] = true; guardar(); }
    });
    agregarGuardadoSim(n, simHost);
  });

  function agregarGuardadoSim(n, host) {
    const box = document.createElement("div");
    box.className = "sim-guardar";
    box.innerHTML = `
      <label for="concl-${n.id}"><b>Mis conclusiones</b> · responde las preguntas con base en tu escenario</label>
      <textarea id="concl-${n.id}" maxlength="2000" placeholder="Escribe aquí lo que descubriste con la simulación..."></textarea>
      <button class="btn btn-rosa btn-sm">Guardar mi escenario</button>`;
    $(".reflexion", host).append(box);
    $("button", box).addEventListener("click", () => {
      const go = () => {
        const est = host._estado || {};
        Nube.registrar("simulacion", Object.assign(estudiante(), {
          nivel: nombreNivel(n), simulacion: est.simulacion, parametros: est.parametros,
          resultados: est.resultados, conclusiones: $("textarea", box).value.trim()
        }));
        S.sims[n.id] = true;
        S.escenarios = (S.escenarios || 0) + 1;
        guardar(); renderProgreso();
        toast("Escenario guardado");
      };
      conPerfil(go);
    });
  }

  function mostrarTab(id, tab) {
    const sec = $("#nivel-" + id);
    $$(".tab", sec).forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    $$(".panel", sec).forEach(p => p.classList.toggle("on", p.dataset.panel === tab));
  }

  /* ---------- Diagnóstico ---------- */
  const estado = {};

  function renderDiagInicio(n) {
    const host = $(`#nivel-${n.id} [data-panel="diag"]`);
    const previo = S.diag[n.id];
    const comps = Object.values(COMPETENCIAS).map(c => `<span>${c.nombre}</span>`).join("");
    host.innerHTML = `
      <div class="panel-intro"><div><h2>Diagnóstico de competencias</h2><p>Línea base del ${n.nombre} · grados ${n.grados}</p></div></div>
      <div class="diag-box">
        <p>Responde con calma y sin ayuda: este diagnóstico no es una evaluación con nota para el boletín. Sirve para conocer tu punto de partida y planear las actividades del Centro de Interés.</p>
        <div class="diag-meta">
          <div><b>${n.diagnostico.length}</b><span>preguntas</span></div>
          <div><b>6</b><span>competencias</span></div>
          <div><b>≈ 30</b><span>minutos</span></div>
        </div>
        <div class="comp-list">${comps}</div>
        ${previo ? `<p>Ya presentaste este diagnóstico el ${new Date(previo.fecha).toLocaleDateString("es-CO")} con nota <b>${previo.nota.toFixed(1)}</b> ${badge(previo.nota)}.</p>` : ""}
        <div class="btns" style="margin-top:8px">
          <button class="btn btn-rosa" data-act="empezar">${previo ? "Presentar de nuevo" : "Empezar diagnóstico"}</button>
          ${previo ? `<button class="btn btn-line" data-act="ver">Ver mis resultados</button>` : ""}
        </div>
      </div>`;
    $('[data-act="empezar"]', host).addEventListener("click", () => {
      const go = () => {
        if (S.perfil && !n.gradosNum.includes(S.perfil.grado)) {
          toast(`Estás registrado en grado ${S.perfil.grado}°. Este diagnóstico es para ${n.grados}.`);
        }
        estado[n.id] = { i: 0, r: Array(n.diagnostico.length).fill(null) };
        renderPregunta(n);
      };
      conPerfil(go);
    });
    const ver = $('[data-act="ver"]', host);
    if (ver) ver.addEventListener("click", () => renderResultado(n, S.diag[n.id]));
  }

  function renderPregunta(n) {
    const host = $(`#nivel-${n.id} [data-panel="diag"]`);
    const st = estado[n.id], q = n.diagnostico[st.i], tot = n.diagnostico.length;
    const L = "ABCD";
    host.innerHTML = `
      <div class="diag-box">
        <div class="q-top"><span>Pregunta ${st.i + 1} de ${tot}</span><span class="q-comp">${COMPETENCIAS[q.c].nombre}</span></div>
        <div class="bar"><i style="width:${(100 * st.i) / tot}%"></i></div>
        <div class="q-text">${q.q}</div>
        <div class="opts">${q.o.map((o, k) => `<button class="opt ${st.r[st.i] === k ? "sel" : ""}" data-k="${k}"><span class="letra">${L[k]}</span><span>${esc(o)}</span></button>`).join("")}</div>
        <div class="q-nav">
          <button class="btn btn-line" data-act="ant" ${st.i === 0 ? "disabled" : ""}>Anterior</button>
          <button class="btn ${st.i === tot - 1 ? "btn-rosa" : "btn-celeste"}" data-act="sig" ${st.r[st.i] === null ? "disabled" : ""}>${st.i === tot - 1 ? "Finalizar" : "Siguiente"}</button>
        </div>
      </div>`;
    $$(".opt", host).forEach(b => b.addEventListener("click", () => {
      st.r[st.i] = +b.dataset.k;
      $$(".opt", host).forEach(x => x.classList.toggle("sel", x === b));
      $('[data-act="sig"]', host).disabled = false;
    }));
    $('[data-act="ant"]', host).addEventListener("click", () => { st.i--; renderPregunta(n); });
    $('[data-act="sig"]', host).addEventListener("click", () => {
      if (st.i < tot - 1) { st.i++; renderPregunta(n); }
      else finalizar(n);
    });
    $(`#nivel-${n.id} .tabs`).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function finalizar(n) {
    const st = estado[n.id];
    const comp = {};
    Object.keys(COMPETENCIAS).forEach(k => comp[k] = { ok: 0, tot: 0 });
    let ok = 0;
    n.diagnostico.forEach((q, i) => {
      comp[q.c].tot++;
      if (st.r[i] === q.a) { comp[q.c].ok++; ok++; }
    });
    const pct = ok / n.diagnostico.length;
    const res = {
      fecha: new Date().toISOString(),
      aciertos: ok, total: n.diagnostico.length,
      nota: notaDe(pct),
      comp: Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, v.tot ? v.ok / v.tot : 0])),
      respuestas: st.r
    };
    S.diag[n.id] = res; guardar();
    const L = "ABCD";
    Nube.registrar("diagnostico", Object.assign(estudiante(), {
      idRegistro: S.perfil ? idDia(S.perfil, n, res.fecha) : undefined, fecha: res.fecha,
      nivel: nombreNivel(n), aciertos: ok, total: n.diagnostico.length,
      nota: res.nota, desempeno: desempeno(res.nota).nombre,
      ...Object.fromEntries(Object.keys(COMPETENCIAS).map(k => [k, Math.round(res.comp[k] * 100)])),
      respuestas: st.r.map((r, i) => `${i + 1}:${r === null ? "-" : L[r]}${r === n.diagnostico[i].a ? "✔" : "✘"}`).join(" ")
    }));
    renderResultado(n, res);
    renderProgreso();
    toast("Diagnóstico guardado en Mi progreso");
  }

  function renderResultado(n, res) {
    const host = $(`#nivel-${n.id} [data-panel="diag"]`);
    const L = "ABCD";
    const filas = Object.entries(COMPETENCIAS).map(([k, c]) => {
      const p = res.comp[k] || 0, nt = notaDe(p);
      return `<div class="comp-row"><span>${c.nombre}</span><div class="track"><i style="width:${Math.max(p * 100, 2)}%"></i></div>${badge(nt)}</div>`;
    }).join("");
    const rev = n.diagnostico.map((q, i) => {
      const r = res.respuestas[i], bien = r === q.a;
      return `<div class="rev-item"><p><b>${i + 1}.</b> ${q.q}</p>
        <p class="${bien ? "ok" : "mal"}">${bien ? "✔ Correcta" : "✘ Respondiste " + (r === null ? "—" : L[r] + ") " + esc(q.o[r]))}</p>
        ${bien ? "" : `<p>Respuesta correcta: <b>${L[q.a]}) ${esc(q.o[q.a])}</b></p>`}
        <p style="color:var(--gris)">${q.e}</p></div>`;
    }).join("");
    host.innerHTML = `
      <div class="panel-intro"><div><h2>Tus resultados</h2><p>${S.perfil ? esc(S.perfil.nombre) + " · " : ""}${new Date(res.fecha).toLocaleString("es-CO")}</p></div></div>
      <div class="diag-box">
        <div class="resultado-top">
          <div class="nota-circ" style="--p:${(res.aciertos / res.total) * 100}"><div><b>${res.nota.toFixed(1)}</b><small>de 5.0</small></div></div>
          <div>
            <h3 style="margin-bottom:6px">${res.aciertos} de ${res.total} respuestas correctas</h3>
            <p style="margin-bottom:8px">Desempeño general: ${badge(res.nota)}</p>
            <p class="sub" style="margin:0">Escala: Bajo (1.0–2.9) · Básico (3.0–3.9) · Alto (4.0–4.5) · Superior (4.6–5.0).</p>
          </div>
        </div>
        <h3>Resultado por competencia</h3>
        <div class="comp-res">${filas}</div>
        <details class="revision"><summary>Revisar mis respuestas y explicaciones</summary>${rev}</details>
        <div class="btns">
          <button class="btn btn-celeste" data-act="retos">Ir a los retos</button>
          <a class="btn btn-line" href="#progreso">Ver mi progreso</a>
          <button class="btn btn-line" data-act="volver">Volver al inicio del diagnóstico</button>
        </div>
      </div>`;
    $('[data-act="retos"]', host).addEventListener("click", () => mostrarTab(n.id, "retos"));
    $('[data-act="volver"]', host).addEventListener("click", () => renderDiagInicio(n));
  }

  /* ---------- Retos ---------- */
  function leerNumero(txt) {
    let t = String(txt).trim().replace(/\s|\$/g, "");
    // Admite 13,5 · 13.5 · 144.000 · 144,000
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
    else t = t.replace(",", ".");
    return t === "" ? NaN : Number(t);
  }

  function renderRetos(n) {
    const host = $(`#nivel-${n.id} [data-panel="retos"]`);
    const hechos = S.retos[n.id] || [];
    host.innerHTML = `
      <div class="panel-intro">
        <div><h2>Retos del territorio</h2><p>Situaciones de Girardot para razonar, analizar, crear y resolver.</p></div>
        <span class="desemp d-alt" id="cont-${n.id}">${hechos.length} de ${n.retos.length} resueltos</span>
      </div>
      <div class="retos">${n.retos.map((r, i) => `
        <article class="reto ${hechos.includes(r.id) ? "hecho" : ""}" data-id="${r.id}">
          <div class="reto-top"><span class="reto-num">RETO ${i + 1}</span><span class="pilar-chip">${r.pilar}</span></div>
          <h3>${r.titulo}</h3>
          <p class="ctx">${r.contexto}</p>
          <p class="preg">${r.pregunta}</p>
          <button class="link-btn" data-act="pista">Ver pista</button>
          <div class="fb pista">💡 ${r.pista}</div>
          <div class="resp">
            <div class="inp"><input inputmode="decimal" aria-label="Tu respuesta" placeholder="Tu respuesta">${r.unidad ? `<span class="u">${r.unidad}</span>` : ""}</div>
            <button class="btn btn-rosa btn-sm" data-act="ok">Comprobar</button>
          </div>
          <div class="fb resultado"></div>
        </article>`).join("")}
      </div>`;
    $$(".reto", host).forEach(card => {
      const r = n.retos.find(x => x.id === card.dataset.id);
      const fb = $(".resultado", card), inp = $("input", card);
      if (hechos.includes(r.id)) { fb.className = "fb resultado ok on"; fb.innerHTML = `<b>¡Reto superado!</b> ${r.solucion}`; }
      $('[data-act="pista"]', card).addEventListener("click", e => { $(".pista", card).classList.toggle("on"); });
      const comprobar = () => {
        const v = leerNumero(inp.value);
        if (isNaN(v)) { fb.className = "fb resultado mal on"; fb.textContent = "Escribe un número. Puedes usar coma para los decimales."; return; }
        const tol = Math.max(Math.abs(r.respuesta) * 0.005, 0.001);
        const bien = Math.abs(v - r.respuesta) <= tol;
        S.intentos = S.intentos || {};
        S.intentos[r.id] = (S.intentos[r.id] || 0) + 1; guardar();
        const primeraVez = bien && !(S.retos[n.id] || []).includes(r.id);
        const enviar = () => Nube.registrar("reto", Object.assign(estudiante(), {
          idRegistro: primeraVez && S.perfil ? idRetoOk(S.perfil, r.id) : undefined,
          nivel: nombreNivel(n), reto: r.id, titulo: r.titulo, respuesta: inp.value.trim(),
          correcta: bien ? "Sí" : "No", intento: S.intentos[r.id]
        }));
        conPerfil(enviar);
        if (bien) {
          fb.className = "fb resultado ok on"; fb.innerHTML = `<b>¡Correcto!</b> ${r.solucion}`;
          card.classList.add("hecho");
          S.retos[n.id] = S.retos[n.id] || [];
          if (!S.retos[n.id].includes(r.id)) { S.retos[n.id].push(r.id); guardar(); renderProgreso(); }
          $("#cont-" + n.id).textContent = `${S.retos[n.id].length} de ${n.retos.length} resueltos`;
        } else {
          fb.className = "fb resultado mal on"; fb.innerHTML = "Aún no. Revisa tus operaciones o consulta la pista.";
        }
      };
      $('[data-act="ok"]', card).addEventListener("click", comprobar);
      inp.addEventListener("keydown", e => { if (e.key === "Enter") comprobar(); });
    });
  }

  /* ---------- Cronograma ---------- */
  function renderCronograma() {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const d = s => new Date(s + "T12:00:00");
    const anio = hoy.getFullYear();
    $("#fases").innerHTML = FASES.map(f => `<div class="fase ${+f.anio === anio ? "actual" : ""}"><b>${f.anio}</b><span>${f.nombre}</span><p>${f.resultado}</p></div>`).join("");
    const color = { docente: "var(--azul)", aula: "var(--rosa)", interno: "var(--celeste)", inst: "#8A5BB8", receso: "var(--gris-2)" };
    let hechas = 0, actual = null, proxima = null;
    const items = CRONOGRAMA.map(a => {
      const ini = d(a.ini), fin = d(a.fin);
      let est = "prox";
      if (hoy > fin) { est = "hecho"; hechas++; }
      else if (hoy >= ini) { est = "curso"; actual = actual || a; }
      else if (!proxima) proxima = a;
      const lab = { hecho: "Realizada", curso: "En curso", prox: "Próxima" }[est];
      const cls = { hecho: "e-hecho", curso: "e-curso", prox: "e-prox" }[est];
      return `<li class="tl ${est}" style="--c:${color[a.tipo]}">
        <div class="tl-fecha">${a.fecha}</div>
        <div class="tl-card">
          <div class="tl-tags"><span class="estado ${cls}">${lab}</span><span class="espacio">${a.espacio}</span></div>
          <h4>${a.actividad}</h4>
          <p>${a.detalle}</p>
          <div class="ev"><b>Evidencia:</b> ${a.evidencia}</div>
          ${a.enlace && est === "curso" ? `<a class="btn btn-rosa btn-sm" style="margin-top:10px" href="${a.enlace}">Presentar el diagnóstico</a>` : ""}
        </div></li>`;
    }).join("");
    $("#timeline").innerHTML = items;
    const pct = Math.round(100 * hechas / CRONOGRAMA.length);
    const ahora = actual ? `<span>En curso</span><b>${actual.actividad} · ${actual.fecha}</b>`
      : proxima ? `<span>Próxima actividad</span><b>${proxima.actividad} · ${proxima.fecha}</b>`
      : `<span>Estado</span><b>Fase 2026 finalizada</b>`;
    $("#cronoResumen").innerHTML = `
      <div class="cr-box cr-ahora">${ahora}</div>
      <div class="cr-box"><span>Actividades realizadas</span><b>${hechas} / ${CRONOGRAMA.length}</b></div>
      <div class="cr-box"><span>Avance de la fase</span><b>${pct} %</b></div>
      <div class="cr-box"><span>Encuentros docentes</span><b>${CRONOGRAMA.filter(a => a.tipo === "docente" && hoy > d(a.fin)).length} / 4</b></div>`;
  }

  /* ---------- Mi progreso ---------- */
  function renderProgreso() {
    const host = $("#progresoBody");
    const p = S.perfil;
    const avisoNube = `<p class="aviso"><span class="nube" id="nubeEstado"></span> <small style="color:var(--gris-2)">Versión del sitio 1.9</small><br>Tus resultados se envían automáticamente a la base de datos del Centro de Interés, que solo consultan los administradores. Con tu usuario y contraseña puedes ver este perfil desde cualquier dispositivo. Si usas un computador compartido, cierra sesión al terminar.</p>`;
    if (!p) {
      host.innerHTML = `<div class="vacio">
          <h3>Ingresa o regístrate</h3>
          <p>Para presentar el diagnóstico, resolver los retos y guardar simulaciones debes diligenciar tu caracterización. Al terminar recibirás tu usuario y contraseña.</p>
          <div class="btns" style="justify-content:center"><button class="btn btn-rosa" data-act="editar">Registrarme</button><button class="btn btn-line" data-act="login">Ya tengo usuario</button></div>
        </div>` + avisoNube;
      $('[data-act="editar"]', host).addEventListener("click", () => pedirPerfil());
      $('[data-act="login"]', host).addEventListener("click", abrirLogin);
      pintarNube(); return;
    }
    const nv = nivelDe(p.grado) || NIVELES[0];
    const completo = perfilCompleto(p);
    const dg = S.diag[nv.id], resueltos = (S.retos[nv.id] || []), rt = resueltos.length, sm = !!S.sims[nv.id];
    const nRet = nv.retos.length;
    const avance = Math.round(((completo ? 1 : 0) + (dg ? 1 : 0) + rt / nRet + (sm ? 1 : 0)) / 4 * 100);
    const paso = (ok, n, t, d, href) => `<a class="paso ${ok ? "ok" : ""}" href="${href}" style="text-decoration:none"><i>${ok ? "✔" : n}</i><div><b>${t}</b><span>${d}</span></div></a>`;
    host.innerHTML = `
      <div class="perfil-card">
        <div class="avatar">${esc((p.nombre || "?").trim()[0] || "?").toUpperCase()}</div>
        <div><h3>${esc(p.nombre)}</h3><p>Grado ${esc(p.grado)}.° · Curso ${esc(p.curso || "—")} · ${esc(nombreNivel(nv))}</p>
          <p>${p.usuario ? `Usuario: <b>${esc(p.usuario)}</b> · Contraseña: <b id="miClave">••••••</b> <button class="link-btn" id="verClave">mostrar</button>`
            : `<span class="estado-chip">Usuario pendiente: se asigna automáticamente con conexión</span>`}</p></div>
        <div class="acciones">
          <a class="btn btn-rosa btn-sm" href="#nivel-${nv.id}">Ir a mi nivel</a>
          <button class="btn btn-line btn-sm" data-act="editar">Editar caracterización</button>
          <button class="btn btn-line btn-sm" data-act="csv">Descargar reporte</button>
          <button class="btn btn-line btn-sm" data-act="imprimir">Imprimir / PDF</button>
          <button class="btn btn-line btn-sm" data-act="salir">Cerrar sesión</button>
        </div>
      </div>
      <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">
        <div class="kpi k-rosa"><span>Avance general</span><b>${avance} %</b></div>
        <div class="kpi"><span>Nota del diagnóstico</span><b>${dg ? dg.nota.toFixed(1) : "—"}</b>${dg ? " " + badge(dg.nota) : ""}</div>
        <div class="kpi k-cel"><span>Retos resueltos</span><b>${rt} / ${nRet}</b></div>
        <div class="kpi"><span>Escenarios guardados</span><b>${S.escenarios || (sm ? 1 : 0)}</b></div>
      </div>
      <div class="barra-avance"><i style="width:${Math.max(avance, 2)}%"></i></div>
      <p class="sub" style="margin:0 0 18px">Ruta de tu nivel: completa los cuatro pasos para llegar al 100 %.</p>
      <div class="ruta-est">
        ${paso(completo, 1, "Caracterización", completo ? "Completa" : "Faltan casillas", "#progreso")}
        ${paso(!!dg, 2, "Diagnóstico", dg ? `${dg.aciertos} de ${dg.total} correctas` : "Pendiente", `#nivel-${nv.id}`)}
        ${paso(rt >= nRet, 3, "Retos", `${rt} de ${nRet} resueltos`, `#nivel-${nv.id}`)}
        ${paso(sm, 4, "Simulación", sm ? "Escenario explorado" : "Pendiente", `#nivel-${nv.id}`)}
      </div>
      <div class="dash-grid">
        <section class="dash-card"><h3>Mis resultados por competencia</h3><p class="sub">Porcentaje de logro en el diagnóstico del ${esc(nv.nombre)}.</p>
          <div class="chart" id="miComp"></div><div class="analisis" id="miComp-an"></div></section>
        <section class="dash-card"><h3>Mis retos y simulación</h3><p class="sub">Estado de las actividades de tu nivel.</p>
          <ol class="top-list">${nv.retos.map((r, i) => { const ok = resueltos.includes(r.id), it = (S.intentos || {})[r.id] || 0;
            return `<li><span class="pos" style="${ok ? "background:var(--ok)" : "background:var(--gris-2)"}">${ok ? "✔" : i + 1}</span><span><b>${esc(r.titulo)}</b><br><small>${ok ? "Resuelto" : it ? "En proceso" : "Sin intentar"} · ${it} intento(s)</small></span><span class="pilar-chip">${esc(r.pilar)}</span></li>`; }).join("")}
            <li><span class="pos" style="${sm ? "background:var(--ok)" : "background:var(--gris-2)"}">${sm ? "✔" : "S"}</span><span><b>Simulación del nivel</b><br><small>${sm ? `${S.escenarios || 1} escenario(s) guardado(s)` : "Explora y guarda tu escenario con conclusiones"}</small></span><span class="pilar-chip">Crear</span></li>
          </ol></section>
      </div>` + avisoNube;
    if (dg) {
      const cortos = { razonamiento: "Razonamiento", datos: "Datos", problemas: "Problemas", computacional: "Computacional", creatividad: "Creatividad", digital: "Digital" };
      const ks = Object.keys(COMPETENCIAS), vals = ks.map(k => Math.round((dg.comp[k] || 0) * 100));
      barChart($("#miComp"), { cats: ks.map(k => cortos[k]), series: [{ name: "Logro", color: COL.celeste, values: vals }], unidad: "%" });
      const mx = vals.indexOf(Math.max(...vals)), mn = vals.indexOf(Math.min(...vals));
      $("#miComp-an").innerHTML = `<div class="cuanti"><span class="t">Tus números</span>Nota ${dg.nota.toFixed(1)} (${desempeno(dg.nota).nombre}) con ${dg.aciertos} de ${dg.total} respuestas correctas. Tu mejor competencia es <b>${COMPETENCIAS[ks[mx]].nombre.toLowerCase()}</b> (${vals[mx]} %).</div>
        <div class="cuali"><span class="t">Recomendación</span>${vals[mn] === vals[mx] ? "Tu desempeño es parejo en todas las competencias. ¡Sigue con los retos!" : `Refuerza <b>${COMPETENCIAS[ks[mn]].nombre.toLowerCase()}</b> (${vals[mn]} %): revisa las explicaciones del diagnóstico y practica con los retos de tu nivel.`}</div>`;
    } else {
      $("#miComp").innerHTML = `<div class="dash-aviso">Aún no has presentado el diagnóstico. <a href="#nivel-${nv.id}">Presentarlo ahora</a></div>`;
    }
    pintarNube();
    const ver = $("#verClave"); if (ver) ver.addEventListener("click", () => { const c = $("#miClave"); const oculto = c.textContent.startsWith("•"); c.textContent = oculto ? p.contrasena : "••••••"; ver.textContent = oculto ? "ocultar" : "mostrar"; });
    $('[data-act="editar"]', host).addEventListener("click", () => pedirPerfil());
    $('[data-act="csv"]', host).addEventListener("click", descargarCSV);
    $('[data-act="imprimir"]', host).addEventListener("click", () => window.print());
    $('[data-act="salir"]', host).addEventListener("click", cerrarSesion);
  }

  // Sincronización automática: pone en cola lo guardado en este navegador que la nube aún no confirmó.
  // Se ejecuta sola (al abrir el sitio, al volver a la pestaña, al recuperar internet y cada 5 minutos).
  function sincronizar() {
    if (!perfilCompleto(S.perfil) || !Nube.estado().activa) return;
    const p = S.perfil;
    if (!p.id) { p.id = Nube.uid(); guardar(); }
    const pendiente = id => !Nube.confirmado(id);
    if (pendiente(idCar(p))) Nube.registrar("caracterizacion", Object.assign(estudiante(), {
      ...datosCar(p) }));
    NIVELES.forEach(nv => {
      const dg = S.diag[nv.id];
      if (dg && pendiente(idDia(p, nv, dg.fecha))) {
        const L = "ABCD";
        Nube.registrar("diagnostico", Object.assign(estudiante(), {
          idRegistro: idDia(p, nv, dg.fecha), fecha: dg.fecha,
          nivel: nombreNivel(nv), aciertos: dg.aciertos, total: dg.total, nota: dg.nota, desempeno: desempeno(dg.nota).nombre,
          ...Object.fromEntries(Object.keys(COMPETENCIAS).map(k => [k, Math.round((dg.comp[k] || 0) * 100)])),
          respuestas: (dg.respuestas || []).map((r, i) => `${i + 1}:${r === null ? "-" : L[r]}${r === nv.diagnostico[i].a ? "✔" : "✘"}`).join(" ")
        }));
      }
      (S.retos[nv.id] || []).forEach(rid => {
        const r = nv.retos.find(x => x.id === rid);
        if (!r || !pendiente(idRetoOk(p, rid))) return;
        Nube.registrar("reto", Object.assign(estudiante(), {
          idRegistro: idRetoOk(p, rid), nivel: nombreNivel(nv), reto: rid, titulo: r.titulo,
          respuesta: String(r.respuesta), correcta: "Sí", intento: (S.intentos && S.intentos[rid]) || ""
        }));
      });
    });
    Nube.enviar();
  }

  function pintarNube() {
    const el = $("#nubeEstado"); if (!el) return;
    const e = Nube.estado();
    if (!e.activa) { el.className = "nube"; el.innerHTML = "<i></i>Nube no configurada: los datos quedan en este navegador" + (e.pendientes ? ` (${e.pendientes} pendientes)` : ""); return; }
    if (e.pendientes) {
      const motivo = !e.enLinea ? " · sin conexión" : e.error === "sin-respuesta" ? " · Google no responde, se reintentará" : e.error === "sin-conexion" ? " · reintentando" : e.error ? " · Google respondió: " + esc(e.error) : "…";
      el.className = "nube pend"; el.innerHTML = `<i></i>${e.pendientes} registro(s) pendiente(s) de envío (${esc(e.tipos.join(", "))})${motivo}`; return;
    }
    el.className = "nube ok";
    el.innerHTML = "<i></i>Todo guardado en la nube" + (e.ultimo ? " · último envío " + new Date(e.ultimo).toLocaleString("es-CO") : "");
  }
  Nube.alCambiar(pintarNube);

  function descargarCSV() {
    const p = S.perfil || {};
    const cols = ["Nombre", "Grado", "Curso", "Nivel", "Fecha diagnóstico", "Aciertos", "Total", "Nota", "Desempeño",
      ...Object.values(COMPETENCIAS).map(c => c.nombre + " (%)"), "Retos resueltos", "Simulación explorada"];
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = NIVELES.map(n => {
      const dg = S.diag[n.id];
      return [p.nombre, p.grado, p.curso, n.nombre + " (" + n.grados + ")",
        dg ? new Date(dg.fecha).toLocaleString("es-CO") : "", dg ? dg.aciertos : "", dg ? dg.total : "",
        dg ? dg.nota.toFixed(1).replace(".", ",") : "", dg ? desempeno(dg.nota).nombre : "",
        ...Object.keys(COMPETENCIAS).map(k => dg ? Math.round((dg.comp[k] || 0) * 100) : ""),
        (S.retos[n.id] || []).length + " de " + n.retos.length, S.sims[n.id] ? "Sí" : "No"].map(q).join(";");
    });
    const blob = new Blob(["﻿" + [cols.map(q).join(";"), ...filas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte_CI_${(p.nombre || "estudiante").replace(/\s+/g, "_")}_${p.curso || p.grado || ""}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- El proyecto: pestañas, noticias y galería ---------- */
  const secP = $("#proyecto");
  function tabProyecto(tab) {
    $$(".tab", secP).forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    $$(".panel", secP).forEach(p => p.classList.toggle("on", p.dataset.panel === tab));
  }
  $$(".tab", secP).forEach(b => b.addEventListener("click", () => {
    const destino = b.dataset.tab === "info" ? "#proyecto" : "#" + b.dataset.tab;
    if (location.hash !== destino) history.replaceState(null, "", destino);
    tabProyecto(b.dataset.tab);
  }));

  const fechaLarga = f => new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  $("#noticias").innerHTML = NOTICIAS.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map((x, i) => `
    <article class="noticia ${i === 0 ? "destacada" : ""}">
      <img src="${x.img}" alt="" loading="lazy">
      <div class="noticia-txt">
        <div class="noticia-meta"><span class="pilar-chip">${esc(x.etiqueta)}</span><time datetime="${x.fecha}">${fechaLarga(x.fecha)}</time></div>
        <h3>${esc(x.titulo)}</h3>
        <p>${esc(x.resumen)}</p>
        ${x.enlace ? `<a class="btn btn-rosa btn-sm" href="${x.enlace}">${esc(x.textoEnlace || "Ver más")}</a>` : ""}
      </div>
    </article>`).join("");

  let filtroGal = "Todas", fotosVisibles = [], fotoActual = 0;
  function renderGaleria() {
    const cats = ["Todas", ...new Set(GALERIA.map(g => g.categoria))];
    $("#filtrosGaleria").innerHTML = cats.map(c => `<button class="filtro" aria-pressed="${c === filtroGal}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
    $$(".filtro").forEach(b => b.addEventListener("click", () => { filtroGal = b.dataset.c; renderGaleria(); }));
    fotosVisibles = GALERIA.filter(g => filtroGal === "Todas" || g.categoria === filtroGal);
    $("#galeriaFull").innerHTML = fotosVisibles.map((g, i) => `
      <figure data-i="${i}" tabindex="0" role="button" aria-label="Ampliar: ${esc(g.titulo)}">
        <img src="${g.src}" alt="${esc(g.titulo)}" loading="lazy">
        <figcaption>${esc(g.titulo)}<small>${esc(g.categoria)} · ${esc(g.fecha)}</small></figcaption>
      </figure>`).join("");
    $$("#galeriaFull figure").forEach(f => {
      f.addEventListener("click", () => abrirFoto(+f.dataset.i));
      f.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirFoto(+f.dataset.i); } });
    });
  }
  const lb = $("#lightbox");
  function abrirFoto(i) {
    fotoActual = (i + fotosVisibles.length) % fotosVisibles.length;
    const g = fotosVisibles[fotoActual];
    $("img", lb).src = g.src; $("img", lb).alt = g.titulo;
    $("figcaption", lb).textContent = `${g.titulo} · ${g.categoria} · ${g.fecha}`;
    if (!lb.open) lb.showModal();
  }
  $(".lb-prev", lb).addEventListener("click", () => abrirFoto(fotoActual - 1));
  $(".lb-next", lb).addEventListener("click", () => abrirFoto(fotoActual + 1));
  $(".lb-close", lb).addEventListener("click", () => lb.close());
  lb.addEventListener("click", e => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") abrirFoto(fotoActual - 1);
    if (e.key === "ArrowRight") abrirFoto(fotoActual + 1);
  });
  renderGaleria();

  /* ---------- Visor de documentos (Informes y Revista) ---------- */
  const visor = $("#visor");
  function abrirDocumento(titulo, pdf, descarga) {
    $("#visorTitulo").textContent = titulo;
    $("#visorFrame").src = pdf;
    $("#visorAbrir").href = pdf;
    $("#visorDescargar").href = descarga || pdf;
    $("#visorDescargar").setAttribute("download", (descarga || pdf).split("/").pop());
    // En celulares los PDF no siempre se muestran incrustados: se abren en pestaña nueva
    if (window.matchMedia("(max-width: 680px)").matches) { window.open(pdf, "_blank", "noopener"); return; }
    visor.showModal();
  }
  $("#visorCerrar").addEventListener("click", () => { visor.close(); $("#visorFrame").src = "about:blank"; });
  visor.addEventListener("close", () => { $("#visorFrame").src = "about:blank"; });

  /* ---------- Repositorio de informes ---------- */
  $("#repoInformes").innerHTML = INFORMES.map((d, i) => `
    <article class="doc-card">
      <button class="doc-cover" data-i="${i}" aria-label="Ver ${esc(d.titulo)}">
        <img src="${d.portada}" alt="Portada: ${esc(d.titulo)}" loading="lazy">
        <span class="doc-num">${esc(d.numero)}</span>
        <span class="ver">👁 Ver documento</span>
      </button>
      <div class="doc-body">
        <div class="doc-meta">${d.etiquetas.map(e => `<span>${esc(e)}</span>`).join("")}</div>
        <h3>${esc(d.numero)} · ${esc(d.titulo)}</h3>
        <p>${esc(d.subtitulo)}</p>
        <p style="font-size:.8rem">${fechaLarga(d.fecha)} · ${d.paginas} páginas</p>
        <p>${esc(d.resumen)}</p>
        <div class="doc-acc">
          <button class="btn btn-rosa btn-sm" data-i="${i}">Ver</button>
          ${d.docx ? `<a class="btn btn-line btn-sm" href="${d.docx}" download>Descargar Word</a>` : ""}
          <a class="btn btn-line btn-sm" href="${d.pdf}" download>Descargar PDF</a>
        </div>
      </div>
    </article>`).join("");
  $$("#repoInformes [data-i]").forEach(b => b.addEventListener("click", () => {
    const d = INFORMES[+b.dataset.i]; abrirDocumento(`${d.numero} · ${d.titulo}`, d.pdf, d.docx || d.pdf);
  }));

  /* ---------- Revista académica ---------- */
  $("#repoRevista").innerHTML = REVISTA.map((v, i) => {
    const listo = !!v.pdf;
    const portada = v.portada ? `<img src="${v.portada}" alt="Portada ${esc(v.volumen)}" loading="lazy">`
      : `<span class="rev-cover"><small>Revista académica · RACR</small><span class="vol">${esc(v.volumen)}</span><span><b>${esc(v.titulo)}</b><br><i>${esc(v.numero)} · ${esc(v.fecha)}</i></span></span>`;
    return `<article class="doc-card ${listo ? "" : "proximo"}">
      <button class="doc-cover" data-v="${i}" ${listo ? "" : "disabled"} aria-label="${listo ? "Ver" : "Próximamente"} ${esc(v.volumen)}">${portada}${listo ? `<span class="ver">👁 Ver volumen</span>` : ""}</button>
      <div class="doc-body">
        ${listo ? "" : `<span class="estado-chip">En preparación</span>`}
        <h3>${esc(v.volumen)} · ${esc(v.numero)}</h3>
        <p>${esc(v.descripcion)}</p>
        <div class="doc-acc">${listo ? `<button class="btn btn-rosa btn-sm" data-v="${i}">Ver</button><a class="btn btn-line btn-sm" href="${v.pdf}" download>Descargar</a>`
          : `<span class="sub" style="font-size:.8rem">Disponible: ${esc(v.fecha)}</span>`}</div>
      </div>
    </article>`;
  }).join("");
  $$("#repoRevista [data-v]").forEach(b => b.addEventListener("click", () => {
    const v = REVISTA[+b.dataset.v]; if (v.pdf) abrirDocumento(`Revista académica · ${v.volumen} · ${v.titulo}`, v.pdf, v.pdf);
  }));

  /* ---------- Redes sociales ---------- */
  const ICONO_RED = {
    Instagram: ['ig', '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/></svg>'],
    Facebook: ['fb', '<svg viewBox="0 0 24 24"><path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H9.2v3h2.5V21"/></svg>'],
    TikTok: ['tt', '<svg viewBox="0 0 24 24"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.1 4.3 5 4.6"/></svg>']
  };
  $("#redes").innerHTML = REDES.map(r => {
    const [cls, svg] = ICONO_RED[r.red] || ["ig", ""];
    const inner = `<span class="red-ico ${cls}">${svg}</span><h3>${esc(r.red)}</h3>${r.url ? `<span class="sub">${esc(r.usuario || "Síguenos")}</span>` : `<span class="prox">Próximamente</span>`}`;
    return r.url ? `<a class="red" href="${esc(r.url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="red" aria-label="${esc(r.red)}: próximamente">${inner}</div>`;
  }).join("");

  /* ---------- Panel del administrador ---------- */
  const AK = "ci-ensma-admin";
  const claveAdmin = { get() { try { return sessionStorage.getItem(AK) || ""; } catch (e) { return ""; } },
    set(v) { try { v ? sessionStorage.setItem(AK, v) : sessionStorage.removeItem(AK); } catch (e) {} } };

  function adminLogin(msg) {
    $("#adminBody").innerHTML = `
      <div class="diag-box" style="max-width:520px">
        <h3>Ingreso de administrador</h3>
        <p class="sub">Solo los docentes administradores pueden ver los resultados de la base de datos. La clave se define en Apps Script (CLAVE_ADMIN).</p>
        <form id="adminForm" class="resp" style="margin-top:14px">
          <div class="inp"><input type="password" name="clave" placeholder="Clave de administrador" autocomplete="current-password" required></div>
          <button class="btn btn-rosa btn-sm">Ingresar</button>
        </form>
        ${msg ? `<div class="fb mal on" style="margin-top:12px">${esc(msg)}</div>` : ""}
      </div>`;
    $("#adminForm").addEventListener("submit", e => {
      e.preventDefault(); const k = e.target.clave.value.trim();
      if (k) cargarAdmin(k);
    });
  }

  async function cargarAdmin(k) {
    $("#adminBody").innerHTML = `<div class="diag-box" style="max-width:520px"><p>Consultando la base de datos…</p></div>`;
    const r = await Nube.admin(k);
    if (!r.ok) { claveAdmin.set(""); adminLogin(r.error === "No autorizado" ? "Clave incorrecta." : r.error); return; }
    claveAdmin.set(k);
    renderAdmin(r);
  }

  function barras(obj, total) {
    const ks = Object.keys(obj); if (!ks.length) return `<p class="sub">Sin datos todavía.</p>`;
    return `<div class="comp-res">${ks.sort().map(k => `<div class="comp-row"><span>${esc(k)}</span><div class="track"><i style="width:${Math.max(100 * obj[k] / (total || 1), 2)}%"></i></div><b>${obj[k]}</b></div>`).join("")}</div>`;
  }

  /* ---------- Dashboard del administrador ---------- */
  const NIVEL_SIM = { "El agua en mi casa": "Nivel I (6.° y 7.°)", "Campaña de reciclaje en la Normal": "Nivel II (8.° y 9.°)", "Residuos en la ribera del Magdalena": "Nivel III (10.° y 11.°)" };
  const NOMBRES_NIVEL = NIVELES.map(n => nombreNivel(n));
  const DOCENTE_GRADO = { 6: "Fredy Ruge", 7: "Norly Ramiro", 8: "Javier Leal", 9: "Álvaro Mejía", 10: "Miguel Medina y Álvaro Mejía", 11: "Miguel Medina" };
  const SECCION_NOMBRE = { inicio: "Inicio", proyecto: "El proyecto", noticias: "Noticias", galeria: "Galería", informes: "Informes", redes: "Redes sociales",
    "nivel-n1": "Nivel I", "nivel-n2": "Nivel II", "nivel-n3": "Nivel III", cronograma: "Cronograma", progreso: "Mi progreso" };
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const f1 = n => fmt(n, 1);
  const lista = arr => arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join(", ") + " y " + arr[arr.length - 1];

  function tarjeta(id, titulo, sub, full) {
    return `<section class="dash-card ${full ? "full" : ""}"><h3>${titulo}</h3><p class="sub">${sub}</p><div class="chart" id="${id}"></div><div id="${id}-leg"></div><div class="analisis" id="${id}-an"></div></section>`;
  }
  function analisis(id, cuanti, cuali) {
    const el = document.getElementById(id + "-an"); if (!el) return;
    el.innerHTML = `<div class="cuanti"><span class="t">Análisis cuantitativo</span>${cuanti}</div><div class="cuali"><span class="t">Análisis cualitativo</span>${cuali}</div>`;
  }
  function sinDatos(id, msg) { const el = document.getElementById(id); if (el) el.innerHTML = `<div class="dash-aviso">${msg}</div>`; }
  const AVISO_V2 = "Este indicador requiere la versión 2 del script (Code.gs). Pegue el código actualizado en Apps Script y publique una <b>nueva versión</b> de la misma implementación; la URL, los permisos y la hoja no cambian.";

  function renderAdmin(r) {
    const v2 = (r.version || 1) >= 2, v3 = (r.version || 1) >= 3, t = r.totales;
    const part = v2 ? r.participacion : { caracterizacion: t.estudiantes, diagnostico: null, retos: null, retosResueltos: null, simulaciones: null, completos: null, totalEstudiantes: t.estudiantes };
    const simNivel = v2 ? r.simPorNivel : Object.entries(r.simulaciones || {}).reduce((o, [k, n]) => { const nv = NIVEL_SIM[k] || k; o[nv] = (o[nv] || 0) + n; return o; }, {});
    const totSim = Object.values(simNivel).reduce((a, b) => a + b, 0);
    const vis = v2 ? r.visitas : null;

    $("#adminBody").innerHTML = `
      <div class="perfil-card">
        <div class="avatar">A</div>
        <div><h3>Dashboard · ${esc(r.hojaDeCalculo)}</h3><p>Datos consultados el ${new Date().toLocaleString("es-CO")}${v2 ? "" : " · script versión ${r.version || 1}"}</p></div>
        <div class="acciones">
          <a class="btn btn-celeste btn-sm" href="${esc(r.url)}" target="_blank" rel="noopener">Abrir Google Sheets</a>
          <button class="btn btn-line btn-sm" id="admRef">Actualizar</button>
          <button class="btn btn-line btn-sm" id="admOut">Cerrar sesión</button>
        </div>
      </div>
      <div class="kpis" style="grid-template-columns:repeat(5,1fr);margin-bottom:24px">
        <div class="kpi k-rosa"><span>Estudiantes caracterizados</span><b>${t.estudiantes}</b></div>
        <div class="kpi"><span>Presentaron diagnóstico</span><b>${part.diagnostico ?? t.diagnosticos}</b></div>
        <div class="kpi k-cel"><span>Completaron todo</span><b>${part.completos ?? "—"}</b></div>
        <div class="kpi"><span>Escenarios de simulación</span><b>${t.simulaciones}</b></div>
        <div class="kpi"><span>Visitas (30 días)</span><b>${vis ? vis.total30 : "—"}</b></div>
      </div>
      ${v2 ? "" : `<div class="dash-aviso" style="margin-bottom:22px">El script de Google conectado es la <b>versión 1</b>: se muestran los indicadores disponibles. ${AVISO_V2}</div>`}
      ${r.ultimoError ? `<p class="aviso" style="margin:0 0 24px">Último error reportado por el script: <code>${esc(r.ultimoError)}</code></p>` : ""}
      <div class="dash-grid">
        <section class="dash-card full"><h3>Estudiantes que han realizado cada recurso por grado y curso</h3>
          <p class="sub">Gráfico dinámico: elija «Todos los grados» para comparar grados, o un grado para ver sus cursos.</p>
          <div class="filtro-dash"><select id="rcSel"><option value="">Todos los grados</option>${[6, 7, 8, 9, 10, 11].map(g => `<option value="${g}">Grado ${g}.° por curso</option>`).join("")}</select></div>
          <div class="chart" id="dRec"></div><div id="dRec-leg"></div><div class="analisis" id="dRec-an"></div></section>
        ${tarjeta("dVis", "Visitas al sitio", "Visitas y visitantes por día durante los últimos 30 días.", true)}
        ${tarjeta("dSec", "Visitas por sección", "Secciones más consultadas en los últimos 30 días.")}
        ${tarjeta("dPart", "Estudiantes participando por sección", "Estudiantes distintos que han usado cada espacio del sitio.")}
        ${tarjeta("dSim", "Simulaciones creadas por nivel", "Escenarios de simulación guardados por los estudiantes.")}
        ${tarjeta("dGrado", "Promedio de calificación por grado", "Nota promedio del diagnóstico (escala 1.0 a 5.0).")}
        <section class="dash-card full"><h3>Estudiantes con mejor promedio por nivel</h3><p class="sub">Promedio de los diagnósticos presentados por cada estudiante (5 mejores por nivel).</p><div class="prog-grid" id="dTop"></div><div class="analisis" id="dTop-an"></div></section>
        <section class="dash-card full"><h3>Estudiantes que no han completado las actividades</h3><p class="sub">Actividades del nivel que corresponde al grado de cada estudiante: diagnóstico, 3 retos y al menos una simulación guardada.</p>
          <div class="filtro-dash"><select id="pfGrado"><option value="">Todos los grados</option>${[6, 7, 8, 9, 10, 11].map(g => `<option value="${g}">${g}.°</option>`).join("")}</select>
          <input id="pfBuscar" placeholder="Buscar estudiante o curso"><button class="btn btn-line btn-sm" id="pfCsv">Descargar listado (CSV)</button></div>
          <div id="dPend"></div><div class="analisis" id="dPend-an"></div></section>
        <section class="dash-card full"><h3>Usuarios y contraseñas de los estudiantes</h3>
          <p class="sub">Acceso exclusivo del administrador. Al cargar el listado se crean automáticamente las cuentas de los estudiantes registrados que aún no tenían usuario.</p>
          <div class="filtro-dash"><button class="btn btn-rosa btn-sm" id="ctCargar">Cargar listado de usuarios</button>
            <select id="ctGrado" hidden><option value="">Todos los grados</option>${[6, 7, 8, 9, 10, 11].map(g => `<option value="${g}">${g}.°</option>`).join("")}</select>
            <input id="ctBuscar" placeholder="Buscar estudiante o usuario" hidden>
            <button class="btn btn-line btn-sm" id="ctCsv" hidden>Descargar (CSV)</button></div>
          <div id="dCuentas"></div></section>
        ${tarjeta("dTerr", "Caracterización tecnológica y territorial", "Zona de residencia, conectividad principal y problemática de interés de los estudiantes.", true)}
        <section class="dash-card full"><h3>Línea base por nivel y competencia</h3><p class="sub">Porcentaje de logro promedio en cada competencia del diagnóstico.</p><div class="prog-grid" id="dComp"></div><div class="analisis" id="dComp-an"></div></section>
        <section class="dash-card full"><h3>Desempeño en los retos</h3><div id="dRetos"></div></section>
        <section class="dash-card full"><h3>Últimos diagnósticos</h3><div id="dUlt"></div></section>
      </div>
      <p class="aviso">Los análisis se generan automáticamente a partir de los datos de la hoja de cálculo y deben leerse junto con el criterio pedagógico del equipo docente.</p>`;
    $("#admRef").addEventListener("click", () => cargarAdmin(claveAdmin.get()));
    $("#admOut").addEventListener("click", () => { claveAdmin.set(""); adminLogin(); toast("Sesión de administrador cerrada"); });

    /* 0. Recursos realizados por grado / curso (gráfico dinámico) */
    const AVISO_V3 = "Este indicador requiere la versión 3 del script (Code_v3.gs). Pegue el código en Apps Script y publique una <b>nueva versión</b> de la misma implementación.";
    if (!v3) { sinDatos("dRec", AVISO_V3); $("#rcSel").hidden = true; }
    else {
      const RC = Object.values(r.recursosPorCurso || {});
      const SER = [["caracterizacion", "Caracterización", COL.azul], ["diagnostico", "Diagnóstico", COL.rosa], ["retos", "Retos", COL.celeste], ["simulacion", "Simulación", "#8A5BB8"]];
      const pintarRec = () => {
        const g = $("#rcSel").value;
        let grupos;
        if (!g) grupos = [6, 7, 8, 9, 10, 11].map(x => { const l = RC.filter(e => e.grado === x); return { cat: x + ".°", ...["estudiantes", ...SER.map(z => z[0])].reduce((o, k) => (o[k] = l.reduce((a, e) => a + e[k], 0), o), {}) }; }).filter(x => x.estudiantes);
        else grupos = RC.filter(e => e.grado === +g).sort((a, b) => String(a.curso).localeCompare(String(b.curso))).map(e => ({ cat: e.curso === "sin curso" ? "Sin curso" : `${g}-${e.curso}`, ...e }));
        if (!grupos.length) { $("#dRec").innerHTML = `<div class="dash-aviso">Sin estudiantes registrados ${g ? "en este grado" : "todavía"}.</div>`; $("#dRec-leg").innerHTML = ""; $("#dRec-an").innerHTML = ""; return; }
        const series = SER.map(([k, nom, col]) => ({ name: nom, color: col, values: grupos.map(x => x[k]) }));
        barChart($("#dRec"), { cats: grupos.map(x => x.cat), series, unidad: "estudiantes" });
        $("#dRec-leg").innerHTML = leyenda(series);
        const tot = grupos.reduce((a, x) => a + x.estudiantes, 0);
        const tasas = SER.map(([k, nom]) => [nom, pct(grupos.reduce((a, x) => a + x[k], 0), tot)]);
        const tasaDiag = grupos.map(x => ({ cat: x.cat, v: pct(x.diagnostico, x.estudiantes), n: x.estudiantes }));
        const mejor = tasaDiag.reduce((a, b) => b.v > a.v ? b : a), peor = tasaDiag.reduce((a, b) => b.v < a.v ? b : a);
        const debil = tasas.slice(1).sort((a, b) => a[1] - b[1])[0];
        analisis("dRec",
          `${g ? `Grado ${g}.°: ` : ""}<b>${tot}</b> estudiantes registrados. Realizaron: ${tasas.map(([n, v]) => `${n.toLowerCase()} ${v} %`).join(", ")}. ${grupos.length > 1 ? `Mayor cobertura del diagnóstico: <b>${mejor.cat}</b> (${mejor.v} %); menor: <b>${peor.cat}</b> (${peor.v} %).` : ""}`,
          `El recurso con menor realización es <b>${debil[0].toLowerCase()}</b> (${debil[1]} %). ${grupos.length > 1 && peor.v < 60 ? `Conviene programar con ${g ? "el curso" : "el grado"} ${peor.cat} un espacio de aula para ponerse al día${g ? "" : ` (responsable: ${DOCENTE_GRADO[parseInt(peor.cat)] || "por asignar"})`}.` : (grupos.length > 1 ? "La cobertura es homogénea entre " + (g ? "cursos" : "grados") : "Por ahora hay un solo " + (g ? "curso" : "grado") + " con registros") + "; el reto ahora es completar los recursos de mayor profundidad (retos y simulación)."}`);
      };
      $("#rcSel").addEventListener("change", pintarRec); pintarRec();
    }

    /* Cuentas de estudiantes (solo administrador) */
    if (!v3) { $("#dCuentas").innerHTML = `<div class="dash-aviso">${AVISO_V3}</div>`; $("#ctCargar").hidden = true; }
    else {
      let cuentas = [];
      const pintarCuentas = () => {
        const g = $("#ctGrado").value, q = $("#ctBuscar").value.trim().toLowerCase();
        const l = cuentas.filter(c => (!g || String(c.grado) === g) && (!q || `${c.nombre} ${c.usuario} ${c.curso}`.toLowerCase().includes(q)));
        $("#dCuentas").innerHTML = l.length ? `<div class="tabla-wrap" style="max-height:460px;overflow:auto"><table class="tabla cuentas-tabla"><thead><tr><th>Estudiante</th><th>Grado / curso</th><th>Usuario</th><th>Contraseña</th><th></th></tr></thead><tbody>${
          l.map(c => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.grado)}.° ${esc(cursoNorm(c.grado, c.curso) || c.curso || "")}</td><td><code>${esc(c.usuario)}</code></td><td><code>${esc(c.contrasena)}</code></td><td><button class="link-btn" data-u="${esc(c.usuario)}">Restablecer</button></td></tr>`).join("")}</tbody></table></div><p class="sub" style="margin-top:6px">${l.length} cuenta(s) en el filtro · ${cuentas.length} en total.</p>`
          : `<div class="dash-aviso">${cuentas.length ? "Ninguna cuenta coincide con el filtro." : "Aún no hay cuentas."}</div>`;
        $$("#dCuentas [data-u]").forEach(b => b.addEventListener("click", async () => {
          if (!confirm(`¿Generar una contraseña nueva para «${b.dataset.u}»? La anterior dejará de funcionar.`)) return;
          const x = await Nube.admin(claveAdmin.get(), { accion: "restablecer", usuario: b.dataset.u });
          if (x.ok) { const c = cuentas.find(c => c.usuario === x.usuario); if (c) c.contrasena = x.contrasena; pintarCuentas(); toast("Contraseña restablecida"); } else toast(x.error || "No fue posible restablecer");
        }));
      };
      $("#ctCargar").addEventListener("click", async () => {
        $("#dCuentas").innerHTML = `<div class="dash-aviso">Cargando y creando cuentas pendientes…</div>`;
        const x = await Nube.admin(claveAdmin.get(), { accion: "cuentas" });
        if (!x.ok) { $("#dCuentas").innerHTML = `<div class="dash-aviso">${esc(x.error || "No fue posible cargar el listado")}</div>`; return; }
        cuentas = x.cuentas || [];
        ["#ctGrado", "#ctBuscar", "#ctCsv"].forEach(id => $(id).hidden = false);
        $("#ctCargar").textContent = "Actualizar listado";
        if (x.creadas) toast(`Se crearon ${x.creadas} cuenta(s) para estudiantes ya registrados`);
        pintarCuentas();
      });
      $("#ctGrado").addEventListener("change", pintarCuentas); $("#ctBuscar").addEventListener("input", pintarCuentas);
      $("#ctCsv").addEventListener("click", () => {
        const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const filas = [["Estudiante", "Grado", "Curso", "Usuario", "Contraseña"].map(q).join(";"), ...cuentas.map(c => [c.nombre, c.grado, cursoNorm(c.grado, c.curso) || c.curso, c.usuario, c.contrasena].map(q).join(";"))];
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + filas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
        a.download = "usuarios_estudiantes_RACR.csv"; document.body.append(a); a.click(); a.remove();
      });
    }

    /* 1. Visitas por día */
    if (!vis) { sinDatos("dVis", AVISO_V2); sinDatos("dSec", AVISO_V2); }
    else {
      const xs = vis.porDia.map(d => d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7));
      const sv = [{ name: "Visitas", color: COL.rosa, values: vis.porDia.map(d => d.visitas), area: true },
                  { name: "Visitantes distintos", color: COL.celeste, values: vis.porDia.map(d => d.visitantes) }];
      lineChart($("#dVis"), { xs, series: sv, xlabel: "Día" });
      $("#dVis-leg").innerHTML = leyenda(sv);
      const v = vis.porDia.map(d => d.visitas), u7 = v.slice(-7).reduce((a, b) => a + b, 0), p7 = v.slice(-14, -7).reduce((a, b) => a + b, 0);
      const pico = vis.porDia.reduce((a, d) => d.visitas > a.visitas ? d : a, vis.porDia[0]);
      const activos = v.filter(x => x > 0).length;
      const tend = p7 ? Math.round(100 * (u7 - p7) / p7) : null;
      if (!vis.total30) analisis("dVis", "Aún no hay visitas registradas en los últimos 30 días.", "El conteo inicia cuando los estudiantes abren el sitio con la versión 2 del script. Conviene socializar el enlace en cada grado.");
      else analisis("dVis",
        `Se registran <b>${vis.total30}</b> visitas en 30 días (promedio de <b>${f1(vis.total30 / 30)}</b> por día), con actividad en ${activos} de 30 días. El pico fue el ${pico.dia.slice(8, 10)}/${pico.dia.slice(5, 7)} con ${pico.visitas} visitas. Últimos 7 días: ${u7} visitas${tend === null ? "" : ` (${tend >= 0 ? "+" : ""}${tend} % frente a la semana anterior)`}.`,
        tend === null ? "El uso del sitio está concentrado en los días de trabajo de aula; todavía no hay suficiente historial para establecer una tendencia."
          : tend >= 10 ? "El interés por el sitio <b>crece</b>: las actividades programadas están movilizando a los estudiantes. Es un buen momento para publicar noticias y nuevos retos."
          : tend <= -10 ? "Las visitas <b>disminuyen</b> frente a la semana anterior. Se recomienda reactivar el uso con una actividad de aula, recordar los pendientes y divulgar avances en Noticias."
          : "El uso del sitio es <b>estable</b>. Los picos coinciden con las sesiones de aula, lo que indica que el acceso depende principalmente de la orientación docente.");
      const sec = Object.entries(vis.porSeccion).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!sec.length) sinDatos("dSec", "Sin visitas registradas todavía.");
      else {
        barChart($("#dSec"), { cats: sec.map(([k]) => SECCION_NOMBRE[k] || k), series: [{ name: "Visitas", color: COL.celeste, values: sec.map(([, n]) => n) }] });
        const tot = sec.reduce((a, [, n]) => a + n, 0), niv = sec.filter(([k]) => k.startsWith("nivel")).reduce((a, [, n]) => a + n, 0);
        analisis("dSec", `La sección más consultada es <b>${SECCION_NOMBRE[sec[0][0]] || sec[0][0]}</b> (${pct(sec[0][1], tot)} % de las visitas). Los tres niveles suman ${pct(niv, tot)} % del tráfico.`,
          niv >= tot / 2 ? "Los estudiantes usan el sitio principalmente para las actividades de su nivel, que es el propósito central del Centro de Interés."
            : "Predomina la consulta de secciones informativas. Conviene orientar a los estudiantes hacia su nivel (diagnóstico, retos y simulaciones).");
      }
    }

    /* 2. Participación por sección */
    if (!v2) sinDatos("dPart", AVISO_V2);
    else {
      const cats = ["Caracterización", "Diagnóstico", "Retos (intentaron)", "Retos (resolvieron)", "Simulaciones", "Completaron todo"];
      const vals = [part.caracterizacion, part.diagnostico, part.retos, part.retosResueltos, part.simulaciones, part.completos];
      barChart($("#dPart"), { cats: ["Caracteriz.", "Diagnóstico", "Retos: intento", "Retos: logro", "Simulación", "Completo"], series: [{ name: "Estudiantes", color: COL.rosa, values: vals }] });
      const base = part.caracterizacion || 1;
      const pasos = [["diagnóstico", part.diagnostico], ["retos", part.retos], ["simulaciones", part.simulaciones]];
      const menor = pasos.slice().sort((a, b) => a[1] - b[1])[0];
      analisis("dPart",
        `De <b>${part.caracterizacion}</b> estudiantes caracterizados, ${pct(part.diagnostico, base)} % presentó el diagnóstico, ${pct(part.retos, base)} % intentó retos (${pct(part.retosResueltos, base)} % resolvió al menos uno), ${pct(part.simulaciones, base)} % guardó una simulación y <b>${pct(part.completos, base)} %</b> completó todas las actividades.`,
        !part.caracterizacion ? "Aún no hay estudiantes registrados." :
        `El espacio con menor participación es <b>${menor[0]}</b>, que se convierte en el principal punto de refuerzo. ${pct(part.completos, base) >= 80 ? "La meta de participación del 80 % se está cumpliendo." : `Para acercarse a la meta del 80 %, los docentes de cada grado pueden programar un momento de clase dedicado a ${menor[0]}.`}`);
    }

    /* 3. Simulaciones por nivel */
    {
      const vals = NOMBRES_NIVEL.map(n => simNivel[n] || 0);
      barChart($("#dSim"), { cats: ["Nivel I", "Nivel II", "Nivel III"], series: [{ name: "Escenarios", color: COL.celeste, values: vals }] });
      if (!totSim) analisis("dSim", "Aún no hay escenarios de simulación guardados.", "Las simulaciones son el puente hacia la fase 2027; se recomienda que cada grupo guarde al menos un escenario con sus conclusiones.");
      else {
        const max = vals.indexOf(Math.max(...vals)), min = vals.indexOf(Math.min(...vals)), nv = ["Nivel I", "Nivel II", "Nivel III"];
        analisis("dSim", `Se han guardado <b>${totSim}</b> escenarios: Nivel I ${vals[0]} (${pct(vals[0], totSim)} %), Nivel II ${vals[1]} (${pct(vals[1], totSim)} %) y Nivel III ${vals[2]} (${pct(vals[2], totSim)} %).`,
          vals[max] === vals[min] ? "La exploración de escenarios está <b>equilibrada</b> entre los tres niveles. El siguiente paso es aumentar la cantidad de escenarios por estudiante y la calidad de las conclusiones registradas." :
          `El <b>${nv[max]}</b> lidera la exploración de escenarios. ${vals[min] === 0 ? `El ${nv[min]} todavía no registra simulaciones: conviene acompañar su primera sesión.` : `El ${nv[min]} presenta menor uso; se sugiere orientar la discusión de las preguntas de reflexión para que los estudiantes guarden sus conclusiones.`}`);
      }
    }

    /* 4. Promedio por grado */
    if (!v2) sinDatos("dGrado", AVISO_V2);
    else {
      const gs = [6, 7, 8, 9, 10, 11].filter(g => r.promedioPorGrado[g]);
      if (!gs.length) { sinDatos("dGrado", "Aún no hay diagnósticos presentados."); }
      else {
        barChart($("#dGrado"), { cats: gs.map(g => g + ".°"), series: [{ name: "Promedio", color: COL.rosa, values: gs.map(g => r.promedioPorGrado[g].promedio) }] });
        const arr = gs.map(g => ({ g, ...r.promedioPorGrado[g] }));
        const mejor = arr.reduce((a, b) => b.promedio > a.promedio ? b : a), peor = arr.reduce((a, b) => b.promedio < a.promedio ? b : a);
        const gen = arr.reduce((a, b) => a + b.promedio * b.n, 0) / arr.reduce((a, b) => a + b.n, 0);
        const bajos = arr.filter(x => x.promedio < 3).map(x => x.g + ".°");
        analisis("dGrado",
          `Promedio general: <b>${f1(gen)}</b> (${desempeno(gen).nombre}). El grado con mejor promedio es ${mejor.g}.° (${f1(mejor.promedio)}, ${mejor.n} diagnósticos) y el más bajo ${peor.g}.° (${f1(peor.promedio)}). Diferencia entre grados: ${f1(mejor.promedio - peor.promedio)} puntos.`,
          bajos.length ? `${lista(bajos)} ${bajos.length > 1 ? "se ubican" : "se ubica"} en desempeño <b>Bajo</b> (menos de 3.0): se recomienda priorizar actividades de refuerzo con los responsables de esos grados (${lista([...new Set(bajos.map(g => DOCENTE_GRADO[parseInt(g)]))])}).`
            : `Todos los grados alcanzan al menos desempeño Básico. ${gen >= 4 ? "La línea base es alta: los retos pueden aumentar su nivel de exigencia." : "La línea base indica un punto de partida intermedio, coherente con el propósito de fortalecer las competencias durante 2027."}`);
      }
    }

    /* 5. Mejores promedios por nivel */
    if (!v2) { $("#dTop").innerHTML = `<div class="dash-aviso">${AVISO_V2}</div>`; }
    else {
      $("#dTop").innerHTML = NOMBRES_NIVEL.map(n => {
        const l = r.mejores[n] || [];
        return `<div class="card"><h3 style="margin-bottom:10px">${esc(n)}</h3>${l.length ? `<ol class="top-list">${l.map((e, i) => `<li><span class="pos">${i + 1}</span><span><b>${esc(e.nombre)}</b><br><small>${esc(e.grado)}.° ${esc(e.curso || "")} · ${e.intentos} intento(s)</small></span><span>${f1(e.promedio)} ${badge(e.promedio)}</span></li>`).join("")}</ol>` : `<p class="sub">Sin diagnósticos todavía.</p>`}</div>`;
      }).join("");
      const tops = NOMBRES_NIVEL.map(n => (r.mejores[n] || [])[0]).filter(Boolean);
      const sup = Object.values(r.mejores).flat().filter(e => e.promedio >= 4.6).length;
      analisis("dTop", tops.length ? `Mejores promedios: ${tops.map(e => `${esc(e.nombre)} (${e.grado}.°, ${f1(e.promedio)})`).join("; ")}. ${sup} de los estudiantes destacados alcanzan desempeño Superior.` : "Aún no hay diagnósticos para establecer un ranking.",
        tops.length ? "Los estudiantes destacados pueden asumir el rol de <b>monitores o tutores pares</b> en los retos y simulaciones de su nivel, fortaleciendo el trabajo colaborativo propuesto en la ruta RACR." : "El ranking se construirá a medida que los estudiantes presenten el diagnóstico.");
    }

    /* 6. Pendientes */
    if (!v2) { $("#dPend").innerHTML = `<div class="dash-aviso">${AVISO_V2}</div>`; $(".filtro-dash").style.display = "none"; }
    else {
      const pintar = () => {
        const g = $("#pfGrado").value, q = $("#pfBuscar").value.trim().toLowerCase();
        const l = r.pendientes.filter(e => (!g || String(e.grado) === g) && (!q || (e.nombre + " " + e.curso).toLowerCase().includes(q)));
        $("#dPend").innerHTML = l.length ? `<div class="tabla-wrap" style="max-height:420px;overflow:auto"><table class="tabla"><thead><tr><th>Estudiante</th><th>Grado</th><th>Nivel</th><th>Le falta</th><th>Avance</th></tr></thead><tbody>${
          l.map(e => `<tr><td>${esc(e.nombre)}</td><td>${esc(e.grado)}.° ${esc(e.curso || "")}</td><td>${esc(e.nivel.split(" (")[0])}</td><td>${e.faltan.map(f => `<span class="falta">${esc(f)}</span>`).join("")}</td><td><b>${e.avance} %</b></td></tr>`).join("")}</tbody></table></div><p class="sub" style="margin-top:6px">${l.length} estudiante(s) en el filtro.</p>`
          : `<div class="dash-aviso">${r.pendientes.length ? "Ningún estudiante coincide con el filtro." : "Todos los estudiantes registrados completaron sus actividades."}</div>`;
      };
      $("#pfGrado").addEventListener("change", pintar); $("#pfBuscar").addEventListener("input", pintar); pintar();
      $("#pfCsv").addEventListener("click", () => {
        const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const filas = [["Estudiante", "Grado", "Curso", "Nivel", "Le falta", "Avance %"].map(q).join(";"), ...r.pendientes.map(e => [e.nombre, e.grado, e.curso, e.nivel, e.faltan.join(", "), e.avance].map(q).join(";"))];
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + filas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
        a.download = "estudiantes_pendientes_RACR.csv"; document.body.append(a); a.click(); a.remove();
      });
      const tot = part.totalEstudiantes || 0, pend = r.pendientes.length;
      const conteo = {}; r.pendientes.forEach(e => e.faltan.forEach(f => { const k = f.split(" (")[0]; conteo[k] = (conteo[k] || 0) + 1; }));
      const masFalta = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
      const porGrado = {}; r.pendientes.forEach(e => porGrado[e.grado] = (porGrado[e.grado] || 0) + 1);
      const gMas = Object.entries(porGrado).sort((a, b) => b[1] - a[1])[0];
      const avProm = pend ? Math.round(r.pendientes.reduce((a, e) => a + e.avance, 0) / pend) : 100;
      analisis("dPend",
        tot ? `<b>${pend}</b> de ${tot} estudiantes (${pct(pend, tot)} %) tienen actividades pendientes; ${part.completos} completaron todo. Avance promedio de quienes tienen pendientes: ${avProm} %.${masFalta ? ` La actividad que más falta es <b>${masFalta[0]}</b> (${masFalta[1]} estudiantes).` : ""}` : "Aún no hay estudiantes registrados.",
        !pend ? "Todos los estudiantes registrados completaron la ruta de su nivel." :
        `${gMas ? `El grado con más pendientes es <b>${gMas[0]}.°</b> (${gMas[1]} estudiantes; responsable: ${DOCENTE_GRADO[gMas[0]] || "por asignar"}). ` : ""}Se recomienda compartir este listado con cada docente responsable para programar un espacio de cierre de actividades antes de la consolidación de resultados.`);
    }

    /* 7. Caracterización territorial */
    if (!v2) sinDatos("dTerr", AVISO_V2);
    else {
      const host = $("#dTerr");
      const bloque = (titulo, obj) => `<div class="card"><h3 style="font-size:1rem">${titulo}</h3>${barras(obj, t.estudiantes)}</div>`;
      host.innerHTML = `<div class="prog-grid">${bloque("Zona de residencia", r.zona)}${bloque("Conectividad principal", r.conectividad)}${bloque("Problemática de interés", r.problematica)}</div>
        <div class="two" style="margin-top:16px">${bloque("Dispositivo en casa", r.dispositivo)}${bloque("Internet en casa", r.internet)}</div>`;
      const n = t.estudiantes || 0, rural = Object.entries(r.zona).filter(([k]) => k.startsWith("Rural")).reduce((a, [, v]) => a + v, 0);
      const limit = (r.conectividad["Datos del celular (recargas o plan)"] || 0) + (r.conectividad["Casi nunca me conecto"] || 0) + (r.conectividad["Zona wifi pública, biblioteca o café internet"] || 0);
      const sinDato = r.zona["Sin dato"] || 0;
      const prob = Object.entries(r.problematica).filter(([k]) => k !== "Sin dato").sort((a, b) => b[1] - a[1]);
      const soloCel = r.dispositivo["Celular"] || 0;
      analisis("dTerr",
        n ? `${pct(rural, n)} % de los estudiantes vive en zona rural y ${pct(limit, n)} % depende de datos móviles, zonas públicas o casi no se conecta. ${pct(soloCel, n)} % cuenta solo con celular.${prob.length ? ` Problemática más elegida: <b>${prob[0][0]}</b> (${prob[0][1]} estudiantes${prob[1] ? `), seguida de ${prob[1][0]} (${prob[1][1]}` : ""}).` : ""}${sinDato ? ` ${sinDato} estudiante(s) aún no responden las preguntas nuevas.` : ""}` : "Aún no hay estudiantes caracterizados.",
        !n ? "—" : `${pct(limit, n) >= 30 ? "Existe una <b>brecha de conectividad</b> relevante: conviene priorizar actividades que funcionen en el colegio y en celular, y aprovechar el envío sin conexión del sitio. " : "La mayoría de los estudiantes tiene conectividad estable, lo que permite proponer trabajo autónomo desde casa. "}${prob.length ? `Las problemáticas elegidas (${lista(prob.slice(0, 3).map(p => p[0].toLowerCase()))}) orientan el <b>reconocimiento del territorio</b> y la selección de escenarios de simulación para 2027.` : ""}`);
    }

    /* 8. Línea base por nivel y competencia */
    const niv = Object.entries(r.niveles || {});
    $("#dComp").innerHTML = niv.length ? niv.map(([nom, n]) => `
      <div class="card">
        <h3 style="margin-bottom:4px">${esc(nom)}</h3>
        <p class="sub" style="margin-bottom:10px">${n.n} diagnóstico(s) · nota promedio <b>${n.promedioNota.toFixed(1)}</b> ${badge(n.promedioNota)}</p>
        <div class="comp-res">${Object.entries(COMPETENCIAS).map(([k, c]) => { const v = n.comp[k] || 0; return `<div class="comp-row"><span>${c.nombre}</span><div class="track"><i style="width:${Math.max(v, 2)}%"></i></div><b>${v} %</b></div>`; }).join("")}</div>
      </div>`).join("") : `<div class="dash-aviso">Aún no hay diagnósticos.</div>`;
    if (niv.length) {
      const debil = niv.map(([nom, n]) => { const [k, v] = Object.entries(n.comp).sort((a, b) => a[1] - b[1])[0]; return { nom: nom.split(" (")[0], c: COMPETENCIAS[k].nombre, v }; });
      const fuerte = niv.map(([nom, n]) => { const [k, v] = Object.entries(n.comp).sort((a, b) => b[1] - a[1])[0]; return { nom: nom.split(" (")[0], c: COMPETENCIAS[k].nombre, v }; });
      analisis("dComp", debil.map((d, i) => `${d.nom}: competencia más baja <b>${d.c.toLowerCase()}</b> (${d.v} %), más alta ${fuerte[i].c.toLowerCase()} (${fuerte[i].v} %).`).join("<br>"),
        `Las competencias con menor logro definen los <b>focos de intervención</b> de cada nivel y deben guiar el diseño de los retos y simulaciones de la siguiente fase. ${new Set(debil.map(d => d.c)).size === 1 ? `Todos los niveles coinciden en ${debil[0].c.toLowerCase()}, lo que sugiere un trabajo institucional transversal.` : ""}`);
    }

    /* 9. Retos y últimos diagnósticos */
    const retos = Object.entries(r.retos || {}).map(([id, x]) => `<tr><td>${esc(x.nivel)}</td><td>${esc(x.titulo)}</td><td>${x.intentos}</td><td>${pct(x.correctos, x.intentos)} %</td><td>${x.resolvieron}</td></tr>`).join("");
    $("#dRetos").innerHTML = retos ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Nivel</th><th>Reto</th><th>Intentos</th><th>Aciertos</th><th>Estudiantes que lo resolvieron</th></tr></thead><tbody>${retos}</tbody></table></div>` : `<div class="dash-aviso">Aún no hay intentos.</div>`;
    const ult = (r.ultimosDiagnosticos || []).map(d => `<tr><td>${new Date(d.fecha).toLocaleString("es-CO")}</td><td>${esc(d.nombre)}</td><td>${esc(d.grado)}.° ${esc(d.curso)}</td><td>${esc(d.nivel)}</td><td>${Number(d.nota).toFixed(1)}</td><td>${badge(Number(d.nota))}</td></tr>`).join("");
    $("#dUlt").innerHTML = ult ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Estudiante</th><th>Grado</th><th>Nivel</th><th>Nota</th><th>Desempeño</th></tr></thead><tbody>${ult}</tbody></table></div>` : `<div class="dash-aviso">Aún no hay diagnósticos.</div>`;
  }

  function abrirAdmin() { const k = claveAdmin.get(); k ? cargarAdmin(k) : adminLogin(); }

  // Visitas: una por sección y por sesión del navegador (el script actualizado las contabiliza)
  function registrarVisita(seccion) {
    const k = "ci-ensma-visita-" + seccion;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch (e) {}
    Nube.visita(seccion);
  }

  /* ---------- Navegación ---------- */
  const VISTAS = ["inicio", "proyecto", "cronograma", "progreso", "admin", ...NIVELES.map(n => "nivel-" + n.id)];
  function navegar() {
    const h = (location.hash || "#inicio").slice(1);
    const subProyecto = { proyecto: "info", noticias: "noticias", galeria: "galeria", informes: "informes", redes: "redes" }[h];
    let vista = subProyecto ? "proyecto" : VISTAS.includes(h) ? h : "inicio";
    // Un estudiante registrado solo accede a los recursos de su nivel
    const mio = miNivel();
    if (mio && vista.startsWith("nivel-") && vista !== "nivel-" + mio.id) {
      toast(`Tu grado corresponde al ${mio.nombre}`); location.replace("#nivel-" + mio.id); return;
    }
    if (subProyecto) tabProyecto(subProyecto);
    $$(".view").forEach(v => v.classList.toggle("on", v.id === vista));
    $$(".nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + vista));
    $(".nav").classList.remove("open"); $(".menu-btn").setAttribute("aria-expanded", "false");
    if (h === "niveles") {
      requestAnimationFrame(() => $("#niveles").scrollIntoView({ behavior: "smooth" }));
    } else {
      window.scrollTo(0, 0);
    }
    if (vista === "progreso") renderProgreso();
    if (vista === "cronograma") renderCronograma();
    if (vista === "admin") abrirAdmin();
    else registrarVisita(subProyecto && subProyecto !== "info" ? subProyecto : vista);
  }
  window.addEventListener("hashchange", navegar);
  $(".menu-btn").addEventListener("click", e => {
    const open = $(".nav").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });

  renderCronograma();
  renderProgreso();
  navegar();
  setTimeout(sincronizar, 1200);
  aplicarNivel();
  // Estudiantes registrados antes: se les pide completar las casillas obligatorias (una vez por sesión)
  if (S.perfil && !perfilCompleto(S.perfil)) {
    let pedido = false; try { pedido = !!sessionStorage.getItem("ci-ensma-car-nueva"); sessionStorage.setItem("ci-ensma-car-nueva", "1"); } catch (e) {}
    if (!pedido) setTimeout(() => { toast("Completa tu caracterización para recibir tu usuario"); pedirPerfil(); }, 2500);
  } else if (S.perfil && !S.perfil.usuario) {
    // Estudiantes ya registrados: se les asigna usuario y contraseña automáticamente
    setTimeout(() => asegurarCuenta(true), 2500);
  }
  setInterval(sincronizar, 5 * 60 * 1000);
  window.addEventListener("online", sincronizar);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
})();
