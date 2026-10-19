/* ==========================================================
   Simulaciones por nivel + utilidades de gráficos (SVG, sin librerías)
   ========================================================== */

const COL = { rosa: "#E0407D", celeste: "#2BA3E3", azul: "#1B2E6B" };

function fmt(n, dec = 0) {
  return Number(n).toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtCompact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return fmt(n / 1e6, 1) + " M";
  if (a >= 1e4) return fmt(n / 1e3, 0) + " mil";
  return fmt(n, a < 10 && n % 1 ? 1 : 0);
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const r = v / p;
  const m = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(x => r <= x);
  return m * p;
}
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text !== undefined) e.textContent = text;
  return e;
}

/* Barras agrupadas */
function barChart(host, { cats, series, unidad = "" }) {
  const W = 640, H = 270, L = 58, R = 12, T = 22, B = 34;
  const max = niceMax(Math.max(...series.flatMap(s => s.values)) * 1.08);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Gráfico de barras" });
  for (let i = 0; i <= 4; i++) {
    const y = T + (H - T - B) * (1 - i / 4);
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: y, y2: y, class: "grid" }));
    svg.append(svgEl("text", { x: L - 8, y: y + 4, "text-anchor": "end" }, fmtCompact(max * i / 4)));
  }
  const gw = (W - L - R) / cats.length, bw = Math.min(56, (gw * 0.7) / series.length);
  cats.forEach((c, i) => {
    const gx = L + gw * i + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i], h = (H - T - B) * (v / max);
      const x = gx + j * bw, y = H - B - h;
      const r = svgEl("rect", { x: x + 2, y, width: bw - 4, height: Math.max(h, 0), rx: 5, fill: s.color });
      r.append(svgEl("title", {}, `${s.name} · ${c}: ${fmt(v)} ${unidad}`));
      svg.append(r);
      svg.append(svgEl("text", { x: x + bw / 2, y: y - 6, "text-anchor": "middle", class: "lbl-v" }, fmtCompact(v)));
    });
    svg.append(svgEl("text", { x: L + gw * i + gw / 2, y: H - 12, "text-anchor": "middle" }, c));
  });
  host.replaceChildren(svg);
}

/* Líneas */
function lineChart(host, { xs, series, xlabel = "", marcaX = null }) {
  const W = 640, H = 280, L = 58, R = 14, T = 16, B = 40;
  const max = niceMax(Math.max(...series.flatMap(s => s.values)) * 1.05);
  const n = xs.length;
  const X = i => L + (W - L - R) * (i / (n - 1));
  const Y = v => T + (H - T - B) * (1 - v / max);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Gráfico de líneas" });
  for (let i = 0; i <= 4; i++) {
    const y = Y(max * i / 4);
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: y, y2: y, class: "grid" }));
    svg.append(svgEl("text", { x: L - 8, y: y + 4, "text-anchor": "end" }, fmtCompact(max * i / 4)));
  }
  const paso = n > 13 ? 3 : 1;
  xs.forEach((x, i) => {
    if (i % paso === 0 || i === n - 1)
      svg.append(svgEl("text", { x: X(i), y: H - B + 18, "text-anchor": "middle" }, x));
  });
  if (xlabel) svg.append(svgEl("text", { x: (L + W - R) / 2, y: H - 2, "text-anchor": "middle" }, xlabel));
  if (marcaX !== null) {
    svg.append(svgEl("line", { x1: X(marcaX), x2: X(marcaX), y1: T, y2: H - B, stroke: COL.rosa, "stroke-dasharray": "4 4", "stroke-width": 1.5 }));
    svg.append(svgEl("text", { x: X(marcaX) + 6, y: T + 12, fill: COL.rosa, style: "fill:" + COL.rosa + ";font-weight:600" }, "Inicia campaña"));
  }
  series.forEach(s => {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    if (s.area) {
      svg.append(svgEl("path", { d: `${d} L${X(n - 1)},${Y(0)} L${X(0)},${Y(0)} Z`, fill: s.color, opacity: .08 }));
    }
    svg.append(svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": s.dash || "" }));
    const li = n - 1;
    svg.append(svgEl("circle", { cx: X(li), cy: Y(s.values[li]), r: 4.5, fill: s.color }));
    svg.append(svgEl("text", { x: X(li) - 6, y: Y(s.values[li]) - 9, "text-anchor": "end", class: "lbl-v" }, fmtCompact(s.values[li])));
  });
  host.replaceChildren(svg);
}

function leyenda(series) {
  return `<div class="chart-leg">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>`;
}
function ctl(id, label, min, max, step, val, extra = "") {
  return `<div class="ctl ${extra}"><label for="${id}">${label}<output id="${id}-o"></output></label>
          <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}

/* ----------------------------------------------------------
   NIVEL I · El agua en mi casa
   ---------------------------------------------------------- */
function simAgua(host, alUsar) {
  host.innerHTML = `
  <div class="sim">
    <div class="sim-head">
      <h3>El agua en mi casa</h3>
      <p>Girardot es una ciudad cálida y el agua se usa mucho. Ajusta los hábitos de tu familia y compara tu escenario con uno de ahorro: duchas de 5 minutos con regadera ahorradora y la llave cerrada al cepillarse.</p>
    </div>
    <div class="sim-body">
      <div class="sim-ctrl">
        ${ctl("a-per", "Personas en la casa", 1, 8, 1, 4)}
        ${ctl("a-min", "Minutos de ducha por persona", 3, 20, 1, 10)}
        <div class="ctl"><label for="a-tipo">Tipo de regadera</label>
          <select id="a-tipo"><option value="12">Convencional (12 L/min)</option><option value="6">Ahorradora (6 L/min)</option></select></div>
        ${ctl("a-des", "Descargas del sanitario por persona al día", 1, 8, 1, 5, "cel")}
        <label class="switch"><input type="checkbox" id="a-llave" checked> Dejo la llave abierta al cepillarme</label>
      </div>
      <div class="sim-out">
        <div class="kpis">
          <div class="kpi k-rosa"><span>Consumo de tu casa al mes</span><b id="a-k1"></b></div>
          <div class="kpi"><span>Por persona al día</span><b id="a-k2"></b></div>
          <div class="kpi k-cel"><span>Podrías ahorrar al mes</span><b id="a-k3"></b></div>
        </div>
        <div class="chart" id="a-ch"></div>
        <div id="a-leg"></div>
        <p class="sub" id="a-txt" style="margin:0"></p>
      </div>
    </div>
    <div class="reflexion">
      <h4>Para pensar y conversar</h4>
      <ol>
        <li>¿Qué hábito produce el mayor consumo en tu casa? ¿Cómo lo sabes con el gráfico?</li>
        <li>Si cada familia de tu curso ahorra lo que muestra la simulación, ¿cuántos litros se ahorrarían en un mes?</li>
        <li>Pregunta en casa cuántos m³ aparecen en el recibo del agua y compáralo con tu simulación.</li>
      </ol>
    </div>
  </div>`;
  const $ = id => host.querySelector("#" + id);
  const CEPILLADO = 3;            // veces al día
  const LLAVE_ABIERTA = 2 * 6;    // 2 min × 6 L/min
  const CON_VASO = 0.5;           // litros con vaso
  const SANITARIO = 9;            // litros por descarga
  function calc() {
    const p = +$("a-per").value, m = +$("a-min").value, q = +$("a-tipo").value, d = +$("a-des").value, ll = $("a-llave").checked;
    $("a-per-o").textContent = p; $("a-min-o").textContent = m + " min"; $("a-des-o").textContent = d;
    const tu = [p * m * q, p * CEPILLADO * (ll ? LLAVE_ABIERTA : CON_VASO), p * d * SANITARIO].map(v => v * 30);
    const ah = [p * 5 * 6, p * CEPILLADO * CON_VASO, p * d * SANITARIO].map(v => v * 30);
    const tTu = tu.reduce((a, b) => a + b), tAh = ah.reduce((a, b) => a + b);
    const ahorro = Math.max(tTu - tAh, 0);
    $("a-k1").textContent = fmt(tTu / 1000, 1) + " m³";
    $("a-k2").textContent = fmt(tTu / 30 / p) + " L";
    $("a-k3").textContent = fmt(ahorro) + " L";
    const series = [
      { name: "Tu escenario", color: COL.rosa, values: tu },
      { name: "Escenario de ahorro", color: COL.celeste, values: ah }
    ];
    barChart($("a-ch"), { cats: ["Ducha", "Cepillado", "Sanitario"], series, unidad: "L/mes" });
    $("a-leg").innerHTML = leyenda(series);
    $("a-txt").innerHTML = ahorro > 0
      ? `Tu casa usa <b>${fmt(tTu)} litros</b> al mes. El ahorro posible equivale a <b>${fmt(ahorro / 20)} botellones</b> de 20 litros (${fmt(100 * ahorro / tTu)} % menos).`
      : `¡Tus hábitos ya coinciden con el escenario de ahorro! Tu casa usa <b>${fmt(tTu)} litros</b> al mes.`;
  }
  host.querySelectorAll("input,select").forEach(i => i.addEventListener("input", () => { calc(); alUsar(); }));
  calc();
}

/* ----------------------------------------------------------
   NIVEL II · Reciclaje en la Normal
   ---------------------------------------------------------- */
function simReciclaje(host, alUsar) {
  host.innerHTML = `
  <div class="sim">
    <div class="sim-head">
      <h3>Campaña de reciclaje en la Normal</h3>
      <p>¿Cuánto plástico PET podría recuperar el colegio en un año escolar de 10 meses? Ajusta el número de estudiantes, el porcentaje que participa y las botellas que aporta cada uno. Se supone que cada botella pesa 25 g.</p>
    </div>
    <div class="sim-body">
      <div class="sim-ctrl">
        ${ctl("r-est", "Estudiantes del colegio", 100, 2000, 50, 900)}
        ${ctl("r-par", "Participación en la campaña", 0, 100, 5, 40)}
        ${ctl("r-bot", "Botellas por estudiante a la semana", 1, 10, 1, 3, "cel")}
        ${ctl("r-pre", "Precio de referencia del PET por kg", 300, 2000, 50, 1000, "cel")}
        <p class="sub" style="font-size:.8rem;margin:0">El precio es un valor de referencia: averigüen el precio real en un centro de acopio de Girardot.</p>
      </div>
      <div class="sim-out">
        <div class="kpis">
          <div class="kpi"><span>Botellas al mes</span><b id="r-k1"></b></div>
          <div class="kpi k-rosa"><span>Plástico al mes</span><b id="r-k2"></b></div>
          <div class="kpi k-cel"><span>Ingreso estimado al mes</span><b id="r-k3"></b></div>
        </div>
        <div class="chart" id="r-ch"></div>
        <div id="r-leg"></div>
        <p class="sub" id="r-txt" style="margin:0"></p>
      </div>
    </div>
    <div class="reflexion">
      <h4>Para pensar y conversar</h4>
      <ol>
        <li>¿Qué pasa con el plástico recuperado si la participación se duplica? ¿La relación es proporcional?</li>
        <li>¿Qué porcentaje de participación se necesita para recuperar al menos 1.000 kg en el año?</li>
        <li>Diseñen una encuesta corta para estimar cuántas botellas usa realmente cada estudiante a la semana.</li>
      </ol>
    </div>
  </div>`;
  const $ = id => host.querySelector("#" + id);
  const PESO = 0.025, SEMANAS = 4, MESES = 10;
  function calc() {
    const e = +$("r-est").value, p = +$("r-par").value / 100, b = +$("r-bot").value, pr = +$("r-pre").value;
    $("r-est-o").textContent = fmt(e); $("r-par-o").textContent = fmt(p * 100) + " %";
    $("r-bot-o").textContent = b; $("r-pre-o").textContent = "$" + fmt(pr);
    const botMes = e * p * b * SEMANAS, kgMes = botMes * PESO;
    const p2 = Math.min(p + 0.2, 1), kgMes2 = e * p2 * b * SEMANAS * PESO;
    $("r-k1").textContent = fmt(botMes);
    $("r-k2").textContent = fmt(kgMes, 1) + " kg";
    $("r-k3").textContent = "$" + fmt(kgMes * pr);
    const xs = Array.from({ length: MESES + 1 }, (_, i) => i === 0 ? "0" : "M" + i);
    const series = [
      { name: `Participación actual (${fmt(p * 100)} %)`, color: COL.rosa, values: xs.map((_, i) => kgMes * i), area: true },
      { name: `Meta: +20 puntos (${fmt(p2 * 100)} %)`, color: COL.celeste, values: xs.map((_, i) => kgMes2 * i), dash: "7 6" }
    ];
    lineChart($("r-ch"), { xs, series, xlabel: "Mes del año escolar · kg acumulados" });
    $("r-leg").innerHTML = leyenda(series);
    $("r-txt").innerHTML = `En 10 meses se recuperarían <b>${fmt(kgMes * MESES)} kg</b> de PET (unos <b>$${fmt(kgMes * MESES * pr)}</b>). Con 20 puntos más de participación serían <b>${fmt(kgMes2 * MESES)} kg</b>.`;
  }
  host.querySelectorAll("input").forEach(i => i.addEventListener("input", () => { calc(); alUsar(); }));
  calc();
}

/* ----------------------------------------------------------
   NIVEL III · Residuos en el río Magdalena: modelo y decisión
   ---------------------------------------------------------- */
function simModelo(host, alUsar) {
  host.innerHTML = `
  <div class="sim">
    <div class="sim-head">
      <h3>Residuos en la ribera del Magdalena: modelar para decidir</h3>
      <p>Supón que cada mes llegan residuos a un sector de la ribera del río y que la cantidad crece con el tiempo. Elige un modelo de crecimiento y simula una campaña de reducción. Compara los escenarios a 24 meses.</p>
    </div>
    <div class="sim-body">
      <div class="sim-ctrl">
        <div class="ctl"><label for="m-mod">Modelo de crecimiento</label>
          <select id="m-mod"><option value="exp">Exponencial: R(t) = R₀(1 + g)ᵗ</option><option value="lin">Lineal: R(t) = R₀(1 + g·t)</option></select></div>
        ${ctl("m-r0", "Residuos actuales R₀ (kg/mes)", 100, 2000, 50, 500)}
        ${ctl("m-g", "Crecimiento mensual g", 0, 10, 0.5, 3)}
        ${ctl("m-red", "Reducción lograda por la campaña", 0, 60, 5, 25, "cel")}
        ${ctl("m-ini", "Mes en que inicia la campaña", 1, 23, 1, 6, "cel")}
      </div>
      <div class="sim-out">
        <div class="modelo" id="m-eq"></div>
        <div class="kpis">
          <div class="kpi k-rosa"><span>Mes 24 sin campaña</span><b id="m-k1"></b></div>
          <div class="kpi k-cel"><span>Mes 24 con campaña</span><b id="m-k2"></b></div>
          <div class="kpi"><span>Residuos evitados en 24 meses</span><b id="m-k3"></b></div>
        </div>
        <div class="chart" id="m-ch"></div>
        <div id="m-leg"></div>
      </div>
    </div>
    <div class="reflexion">
      <h4>Para pensar y conversar</h4>
      <ol>
        <li>Con el mismo g, ¿por qué el modelo exponencial termina por encima del lineal? Explícalo con la ecuación.</li>
        <li>¿Qué conviene más: iniciar la campaña antes o lograr una reducción mayor? Prueba y argumenta con datos.</li>
        <li>¿Qué datos reales de Girardot necesitarían para estimar R₀ y g? ¿Cómo los recolectarían?</li>
      </ol>
    </div>
  </div>`;
  const $ = id => host.querySelector("#" + id);
  const N = 24;
  function calc() {
    const mod = $("m-mod").value, r0 = +$("m-r0").value, g = +$("m-g").value / 100, red = +$("m-red").value / 100, ini = +$("m-ini").value;
    $("m-r0-o").textContent = fmt(r0) + " kg"; $("m-g-o").textContent = fmt(g * 100, 1) + " %";
    $("m-red-o").textContent = fmt(red * 100) + " %"; $("m-ini-o").textContent = "mes " + ini;
    const R = t => mod === "exp" ? r0 * Math.pow(1 + g, t) : r0 * (1 + g * t);
    const sin = [], con = [];
    for (let t = 0; t <= N; t++) { sin.push(R(t)); con.push(t >= ini ? R(t) * (1 - red) : R(t)); }
    const evit = sin.reduce((a, v, i) => a + v - con[i], 0);
    const dup = mod === "exp"
      ? (g > 0 ? `se duplica cada ${fmt(Math.log(2) / Math.log(1 + g), 1)} meses` : "no crece")
      : (g > 0 ? `aumenta ${fmt(r0 * g, 1)} kg cada mes` : "no crece");
    $("m-eq").innerHTML = (mod === "exp"
      ? `R(t) = ${fmt(r0)} · (${fmt(1 + g, 3)})<sup>t</sup>`
      : `R(t) = ${fmt(r0)} · (1 + ${fmt(g, 3)}·t)`) + ` &nbsp;→&nbsp; <span style="font-family:var(--f-txt);font-size:.9rem">la cantidad ${dup}</span>`;
    $("m-k1").textContent = fmt(sin[N]) + " kg";
    $("m-k2").textContent = fmt(con[N]) + " kg";
    $("m-k3").textContent = fmt(evit) + " kg";
    const xs = Array.from({ length: N + 1 }, (_, i) => String(i));
    const series = [
      { name: "Sin campaña", color: COL.rosa, values: sin, area: true },
      { name: "Con campaña", color: COL.celeste, values: con }
    ];
    lineChart($("m-ch"), { xs, series, xlabel: "Mes (t) · kg de residuos por mes", marcaX: ini });
    $("m-leg").innerHTML = leyenda(series);
  }
  host.querySelectorAll("input,select").forEach(i => i.addEventListener("input", () => { calc(); alUsar(); }));
  calc();
}

const SIMULACIONES = { n1: simAgua, n2: simReciclaje, n3: simModelo };
