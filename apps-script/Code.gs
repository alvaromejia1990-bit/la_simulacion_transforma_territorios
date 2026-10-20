/**
 * Simulación que transforma territorio (RACR) · ENSMA Girardot
 * Receptor de datos del sitio web → Hoja de cálculo de Google (Drive)
 *
 * Instalación (ver GUIA_NUBE.md):
 *  1. Cree una hoja de cálculo en su Google Drive.
 *  2. Extensiones → Apps Script → pegue este código y guarde.
 *  3. Implementar → Nueva implementación → Aplicación web
 *     Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 *  4. Copie la URL (/exec) en js/config.js del sitio.
 */

// Debe coincidir con CONFIG_NUBE.clave en js/config.js
const CLAVE = 'ENSMA-RACR-2026';

const COMUNES = [
  ['ID registro', 'idRegistro'], ['Fecha', 'fecha'], ['ID estudiante', 'idEstudiante'],
  ['Nombre', 'nombre'], ['Grado', 'grado'], ['Curso', 'curso']
];

const HOJAS = {
  caracterizacion: { nombre: 'Caracterización', columnas: COMUNES.concat([
    ['Edad', 'edad'], ['Dispositivo en casa', 'dispositivo'], ['Internet en casa', 'internet']
  ]) },
  diagnostico: { nombre: 'Diagnósticos', columnas: COMUNES.concat([
    ['Nivel', 'nivel'], ['Aciertos', 'aciertos'], ['Total', 'total'], ['Nota', 'nota'], ['Desempeño', 'desempeno'],
    ['Razonamiento lógico-matemático %', 'razonamiento'], ['Interpretación de datos %', 'datos'],
    ['Resolución de problemas %', 'problemas'], ['Pensamiento computacional %', 'computacional'],
    ['Creatividad %', 'creatividad'], ['Competencia digital %', 'digital'], ['Respuestas', 'respuestas']
  ]) },
  reto: { nombre: 'Retos', columnas: COMUNES.concat([
    ['Nivel', 'nivel'], ['Código reto', 'reto'], ['Reto', 'titulo'], ['Respuesta dada', 'respuesta'],
    ['Correcta', 'correcta'], ['Intento N.°', 'intento']
  ]) },
  simulacion: { nombre: 'Simulaciones', columnas: COMUNES.concat([
    ['Nivel', 'nivel'], ['Simulación', 'simulacion'], ['Parámetros', 'parametros'],
    ['Resultados', 'resultados'], ['Conclusiones del estudiante', 'conclusiones']
  ]) }
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.clave !== CLAVE) return salida({ ok: false, error: 'clave' });
    const def = HOJAS[d.tipo];
    if (!def) return salida({ ok: false, error: 'tipo' });
    const hoja = obtenerHoja(def);
    // Evita duplicados si el navegador reenvía un registro
    if (hoja.getLastRow() > 1 &&
        hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).createTextFinder(d.idRegistro).matchEntireCell(true).findNext()) {
      return salida({ ok: true, duplicado: true });
    }
    const fila = def.columnas.map(function (c) {
      let v = d[c[1]];
      if (c[1] === 'fecha') v = new Date(v);
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) v = JSON.stringify(v);
      return v === undefined || v === null ? '' : v;
    });
    hoja.appendRow(fila);
    return salida({ ok: true });
  } catch (err) {
    return salida({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Permite comprobar en el navegador que la URL funciona
function doGet() {
  return salida({ ok: true, servicio: 'Simulación que transforma territorio (RACR)', hojas: Object.keys(HOJAS) });
}

function obtenerHoja(def) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(def.nombre);
  if (!hoja) {
    hoja = libro.insertSheet(def.nombre);
    hoja.getRange(1, 1, 1, def.columnas.length)
      .setValues([def.columnas.map(function (c) { return c[0]; })])
      .setFontWeight('bold').setBackground('#1B2E6B').setFontColor('#FFFFFF');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// Ejecute esta función una vez desde el editor para crear las cuatro pestañas y autorizar el script
function prepararHojas() {
  Object.keys(HOJAS).forEach(function (k) { obtenerHoja(HOJAS[k]); });
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
