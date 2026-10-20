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
  const idCar = p => "car-" + p.id + "-" + hash([p.nombre, p.grado, p.curso, p.edad, p.dispositivo, p.internet].join("|"));
  const idDia = (p, nv, fecha) => "dia-" + p.id + "-" + nv.id + "-" + fecha;
  const idRetoOk = (p, rid) => "ret-" + p.id + "-" + rid;

  const notaDe = pct => Math.round((1 + 4 * pct) * 10) / 10;
  const desempeno = nota => ESCALA.find(e => nota >= e.min);
  const badge = nota => { const d = desempeno(nota); return `<span class="desemp d-${d.clase}">${d.nombre}</span>`; };

  /* ---------- Perfil del estudiante ---------- */
  let perfilCallback = null;
  function pedirPerfil(cb) {
    perfilCallback = cb || null;
    const f = $("#perfilForm");
    if (S.perfil) {
      f.nombre.value = S.perfil.nombre; f.grado.value = S.perfil.grado; f.curso.value = S.perfil.curso || "";
      f.edad.value = S.perfil.edad || ""; f.dispositivo.value = S.perfil.dispositivo || ""; f.internet.value = S.perfil.internet || "";
    }
    $("#perfilDlg").showModal();
  }
  $("#perfilForm").addEventListener("submit", e => {
    const f = e.target;
    if (!f.nombre.value.trim() || !f.grado.value) { e.preventDefault(); return; }
    S.perfil = {
      id: (S.perfil && S.perfil.id) || Nube.uid(),
      nombre: f.nombre.value.trim(), grado: +f.grado.value, curso: f.curso.value.trim(),
      edad: f.edad.value, dispositivo: f.dispositivo.value, internet: f.internet.value
    };
    guardar();
    Nube.registrar("caracterizacion", Object.assign(estudiante(), { idRegistro: idCar(S.perfil), edad: S.perfil.edad, dispositivo: S.perfil.dispositivo, internet: S.perfil.internet }));
    toast("Caracterización guardada");
    renderProgreso();
    if (perfilCallback) { const cb = perfilCallback; perfilCallback = null; setTimeout(cb, 50); }
  });
  $("#perfilCancel").addEventListener("click", () => { perfilCallback = null; $("#perfilDlg").close(); });

  /* ---------- Tarjetas de nivel en inicio ---------- */
  $("#nivelCards").innerHTML = NIVELES.map(n => `
    <a class="ncard" href="#nivel-${n.id}">
      <div class="ncard-top bg-${n.color}" data-num="${n.numero}">
        <small>Grados <span class="grados">${n.grados}</span></small>
        <h3>${n.nombre}</h3>
      </div>
      <div class="ncard-body">
        <b>${n.tema}</b>
        <p>${n.descripcion}</p>
        <div class="espacios"><span>Diagnóstico</span><span>${n.retos.length} retos</span><span>Simulación</span></div>
      </div>
    </a>`).join("");

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
      S.perfil ? go() : pedirPerfil(go);
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
      S.perfil ? go() : pedirPerfil(go);
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
        S.perfil ? enviar() : pedirPerfil(enviar);
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
    const cabecera = p ? `
      <div class="perfil-card">
        <div class="avatar">${esc(p.nombre.trim()[0] || "?").toUpperCase()}</div>
        <div><h3>${esc(p.nombre)}</h3><p>Grado ${p.grado}°${p.curso ? " · Curso " + esc(p.curso) : ""}</p></div>
        <div class="acciones">
          <button class="btn btn-line btn-sm" data-act="editar">Editar datos</button>
          <button class="btn btn-celeste btn-sm" data-act="csv">Descargar reporte (CSV)</button>
          <button class="btn btn-line btn-sm" data-act="imprimir">Imprimir / PDF</button>
          <button class="btn btn-line btn-sm" data-act="borrar">Borrar mis datos</button>
        </div>
      </div>` : `
      <div class="vacio">
        <h3>Aún no te has registrado</h3>
        <p>Regístrate para guardar tus resultados del diagnóstico, los retos y las simulaciones.</p>
        <button class="btn btn-rosa" data-act="editar">Registrarme</button>
      </div>`;
    const tarjetas = NIVELES.map(n => {
      const dg = S.diag[n.id], rt = (S.retos[n.id] || []).length, sm = !!S.sims[n.id];
      const comp = dg ? `<div class="mini-comp">${Object.entries(COMPETENCIAS).map(([k, c]) => {
        const v = dg.comp[k] || 0; return `<div><span>${c.nombre}</span>${badge(notaDe(v))}<div class="track"><i style="width:${Math.max(v * 100, 2)}%"></i></div></div>`;
      }).join("")}</div>` : "";
      return `<div class="prog-card">
        <div class="ncard-top bg-${n.color}" data-num="${n.numero}"><small>Grados ${n.grados}</small><h3>${n.nombre}</h3></div>
        <div class="prog-body">
          <div class="prog-line"><span>Diagnóstico</span>${dg ? `<span><b>${dg.nota.toFixed(1)}</b> ${badge(dg.nota)}</span>` : `<a href="#nivel-${n.id}">Pendiente</a>`}</div>
          ${comp}
          <div class="prog-line"><span>Retos resueltos</span><b>${rt} / ${n.retos.length}</b></div>
          <div class="prog-line"><span>Simulación explorada</span><b>${sm ? "Sí ✔" : "No"}</b></div>
        </div></div>`;
    }).join("");
    host.innerHTML = cabecera + `<div class="prog-grid" style="margin-top:8px">${tarjetas}</div>
      <p class="aviso"><span class="nube" id="nubeEstado"></span> <small style="color:var(--gris-2)">Versión del sitio 1.7</small><br>Tu caracterización, diagnósticos, retos y escenarios se envían a la base de datos del Centro de Interés en Google Drive, que solo pueden consultar los administradores. El envío es automático: si no hay internet, se guardan aquí y se envían solos cuando vuelva la conexión. También puedes descargar tu reporte (CSV) o imprimirlo. Si usas un computador compartido, borra tus datos de este navegador al terminar.</p>`;
    pintarNube();
    $$('[data-act="editar"]', host).forEach(b => b.addEventListener("click", () => pedirPerfil()));
    const csv = $('[data-act="csv"]', host); if (csv) csv.addEventListener("click", descargarCSV);
    const imp = $('[data-act="imprimir"]', host); if (imp) imp.addEventListener("click", () => window.print());
    const bor = $('[data-act="borrar"]', host); if (bor) bor.addEventListener("click", () => {
      if (!confirm("¿Borrar tus datos y resultados de este navegador?")) return;
      S = { perfil: null, diag: {}, retos: {}, sims: {}, intentos: {} }; guardar();
      NIVELES.forEach(n => { renderDiagInicio(n); renderRetos(n); });
      renderProgreso(); toast("Datos borrados");
    });
  }

  // Sincronización automática: pone en cola lo guardado en este navegador que la nube aún no confirmó.
  // Se ejecuta sola (al abrir el sitio, al volver a la pestaña, al recuperar internet y cada 5 minutos).
  function sincronizar() {
    if (!S.perfil || !Nube.estado().activa) return;
    const p = S.perfil;
    if (!p.id) { p.id = Nube.uid(); guardar(); }
    const pendiente = id => !Nube.confirmado(id);
    if (pendiente(idCar(p))) Nube.registrar("caracterizacion", Object.assign(estudiante(), {
      idRegistro: idCar(p), edad: p.edad, dispositivo: p.dispositivo, internet: p.internet }));
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

  function renderAdmin(r) {
    const t = r.totales;
    const grados = Object.fromEntries(Object.entries(r.porGrado).map(([g, n]) => [g + "°", n]));
    const niveles = Object.entries(r.niveles).map(([nom, n]) => `
      <div class="card">
        <h3 style="margin-bottom:4px">${esc(nom)}</h3>
        <p class="sub" style="margin-bottom:10px">${n.n} diagnóstico(s) · nota promedio <b>${n.promedioNota.toFixed(1)}</b> ${badge(n.promedioNota)}</p>
        <div class="espacios" style="margin-bottom:12px">${["Bajo", "Básico", "Alto", "Superior"].map(d => `<span>${d}: ${n.desempeno[d] || 0}</span>`).join("")}</div>
        <div class="comp-res">${Object.entries(COMPETENCIAS).map(([k, c]) => {
          const v = n.comp[k] || 0; return `<div class="comp-row"><span>${c.nombre}</span><div class="track"><i style="width:${Math.max(v, 2)}%"></i></div><b>${v} %</b></div>`; }).join("")}</div>
      </div>`).join("") || `<p class="sub">Aún no hay diagnósticos.</p>`;
    const retos = Object.entries(r.retos).map(([id, x]) => `<tr><td>${esc(x.nivel)}</td><td>${esc(x.titulo)}</td><td>${x.intentos}</td><td>${x.intentos ? Math.round(100 * x.correctos / x.intentos) : 0} %</td><td>${x.resolvieron}</td></tr>`).join("");
    const ult = r.ultimosDiagnosticos.map(d => `<tr><td>${new Date(d.fecha).toLocaleString("es-CO")}</td><td>${esc(d.nombre)}</td><td>${esc(d.grado)}° ${esc(d.curso)}</td><td>${esc(d.nivel)}</td><td>${Number(d.nota).toFixed(1)}</td><td>${badge(Number(d.nota))}</td></tr>`).join("");
    $("#adminBody").innerHTML = `
      <div class="perfil-card">
        <div class="avatar">A</div>
        <div><h3>Base de datos: ${esc(r.hojaDeCalculo)}</h3><p>Datos actualizados al ${new Date().toLocaleString("es-CO")}</p></div>
        <div class="acciones">
          <a class="btn btn-celeste btn-sm" href="${esc(r.url)}" target="_blank" rel="noopener">Abrir Google Sheets</a>
          <button class="btn btn-line btn-sm" id="admRef">Actualizar</button>
          <button class="btn btn-line btn-sm" id="admOut">Cerrar sesión</button>
        </div>
      </div>
      <div class="kpis" style="grid-template-columns:repeat(5,1fr);margin-bottom:24px">
        <div class="kpi k-rosa"><span>Estudiantes caracterizados</span><b>${t.estudiantes}</b></div>
        <div class="kpi"><span>Diagnósticos</span><b>${t.diagnosticos}</b></div>
        <div class="kpi k-cel"><span>Intentos de retos</span><b>${t.retos}</b></div>
        <div class="kpi"><span>Escenarios guardados</span><b>${t.simulaciones}</b></div>
        <div class="kpi"><span>Registros de caracterización</span><b>${t.caracterizacion}</b></div>
      </div>
      ${r.ultimoError ? `<p class="aviso" style="margin:0 0 24px">Último error reportado: <code>${esc(r.ultimoError)}</code></p>` : ""}
      <div class="sec-head" style="margin-top:12px"><p class="eyebrow">Caracterización</p><h2>Estudiantes por grado</h2></div>
      <div class="two">
        <div class="card">${barras(grados, t.estudiantes)}</div>
        <div class="card"><h3>Dispositivo en casa</h3>${barras(r.dispositivo, t.estudiantes)}<h3 style="margin-top:16px">Internet en casa</h3>${barras(r.internet, t.estudiantes)}</div>
      </div>
      <div class="sec-head"><p class="eyebrow">Línea base</p><h2>Diagnóstico por nivel</h2></div>
      <div class="prog-grid">${niveles}</div>
      <div class="sec-head"><p class="eyebrow">Retos</p><h2>Desempeño en los retos</h2></div>
      ${retos ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Nivel</th><th>Reto</th><th>Intentos</th><th>Aciertos</th><th>Estudiantes que lo resolvieron</th></tr></thead><tbody>${retos}</tbody></table></div>` : `<p class="sub">Aún no hay intentos.</p>`}
      <div class="sec-head"><p class="eyebrow">Simulaciones</p><h2>Escenarios guardados</h2></div>
      <div class="card">${barras(r.simulaciones, t.simulaciones)}</div>
      <div class="sec-head"><p class="eyebrow">Actividad reciente</p><h2>Últimos diagnósticos</h2></div>
      ${ult ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Estudiante</th><th>Grado</th><th>Nivel</th><th>Nota</th><th>Desempeño</th></tr></thead><tbody>${ult}</tbody></table></div>` : `<p class="sub">Aún no hay diagnósticos.</p>`}
      <p class="aviso">La información completa, con respuestas, conclusiones y parámetros de cada simulación, está en Google Sheets. Esa hoja solo la pueden abrir las cuentas con las que se haya compartido en Drive.</p>`;
    $("#admRef").addEventListener("click", () => cargarAdmin(claveAdmin.get()));
    $("#admOut").addEventListener("click", () => { claveAdmin.set(""); adminLogin(); toast("Sesión de administrador cerrada"); });
  }

  function abrirAdmin() { const k = claveAdmin.get(); k ? cargarAdmin(k) : adminLogin(); }

  /* ---------- Navegación ---------- */
  const VISTAS = ["inicio", "proyecto", "cronograma", "progreso", "admin", ...NIVELES.map(n => "nivel-" + n.id)];
  function navegar() {
    const h = (location.hash || "#inicio").slice(1);
    const subProyecto = { proyecto: "info", noticias: "noticias", galeria: "galeria" }[h];
    let vista = subProyecto ? "proyecto" : VISTAS.includes(h) ? h : "inicio";
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
  setInterval(sincronizar, 5 * 60 * 1000);
  window.addEventListener("online", sincronizar);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
})();
