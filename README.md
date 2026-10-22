# Simulación que transforma territorio (RACR)

Sitio web interactivo de consulta y seguimiento del **Centro de Interés** del núcleo de Matemáticas y Tecnología de la **IE Escuela Normal Superior María Auxiliadora de Girardot**.

| | |
|---|---|
| **Título** | Simulación que transforma territorio (RACR) |
| **Subcategoría** | Simulación, matemática y tecnología |
| **Eje del CI** | Ciencia, tecnología e innovación |
| **Proyecto institucional** | Pensamiento Matemático y Computacional a través de la Resolución de Problemas (2026–2030) |

## Contenido del sitio

- **Inicio**: ficha del Centro de Interés, pilares (Razonar, Analizar, Crear, Resolver), acceso a los niveles, **Revista académica** (repositorio de volúmenes con visor y descarga) y galería.
- **El proyecto** (con pestañas):
  - **El proyecto**: pregunta orientadora, objetivos, metas, ruta metodológica, articulación con el PEI y equipo dinamizador.
  - **Noticias**: novedades del Centro de Interés (se editan en `js/data.js` → `NOTICIAS`).
  - **Galería**: fotos con filtros por categoría y vista ampliada (se editan en `js/data.js` → `GALERIA`).
  - **Informes**: repositorio de documentos con portada, visor en línea y descarga (`js/data.js` → `INFORMES`, archivos en `docs/informes/`).
  - **Redes sociales**: Instagram, Facebook y TikTok («Próximamente» hasta que se registre el enlace en `js/data.js` → `REDES`).
- **Nivel I (6.° y 7.°)**, **Nivel II (8.° y 9.°)** y **Nivel III (10.° y 11.°)**, cada uno con tres espacios:
  - **Diagnóstico**: 12 preguntas, 2 por cada competencia (razonamiento lógico-matemático, interpretación de datos, resolución de problemas, pensamiento computacional, creatividad y competencia digital). Muestra la nota de 1.0 a 5.0 y el desempeño (Bajo, Básico, Alto, Superior) por competencia, con las explicaciones.
  - **Retos**: 3 problemas contextualizados en Girardot, con pista y verificación automática.
  - **Simulaciones**: Nivel I: el agua en mi casa · Nivel II: campaña de reciclaje · Nivel III: modelo de residuos en la ribera del Magdalena (lineal y exponencial).
- **Cronograma**: fase 2026 con el estado de cada actividad (realizada, en curso, próxima), que se calcula con la fecha del día.
- **Mi progreso**: caracterización del estudiante, resultados por nivel, estado del envío a la nube, descarga de un reporte CSV e impresión a PDF.
- **Dashboard del administrador** (`#admin`, enlace en el pie de página): protegido con la clave de administrador definida en Apps Script. Incluye visitas, participación por sección, simulaciones por nivel, promedio por grado, mejores promedios por nivel, estudiantes con actividades pendientes (con descarga CSV), caracterización tecnológica y territorial y línea base por competencia. Cada gráfico tiene su análisis cuantitativo y cualitativo, generado automáticamente.

> **Datos en la nube:** la caracterización, los diagnósticos, los intentos de los retos y los escenarios de simulación se guardan en una hoja de Google Sheets en Drive mediante Google Apps Script. Para activarlo siga **[GUIA_NUBE.md](GUIA_NUBE.md)** y pegue la URL en `js/config.js`. Mientras no esté configurado, los datos quedan en el navegador del estudiante.

## Estructura

```
├── index.html
├── css/styles.css         Estilos y colores institucionales
├── js/config.js           URL de la nube (Google Apps Script)
├── js/nube.js             Cola de envío de registros a Google Drive
├── js/data.js             Preguntas, retos, cronograma, noticias y galería
├── js/simulaciones.js     Simulaciones y gráficos (SVG, sin librerías)
├── js/app.js              Navegación, diagnóstico, retos y seguimiento
├── img/                   Logo y fotografías
├── docs/informes/         Informes (PDF para ver, DOCX para descargar, portada JPG)
├── docs/revista/          Volúmenes de la revista académica (PDF)
├── apps-script/Code.gs    Código para la hoja de cálculo en Drive
├── GUIA_NUBE.md           Paso a paso para conectar Drive
└── .nojekyll
```

## Publicar en GitHub Pages

1. Cree un repositorio nuevo en GitHub (por ejemplo, `ci-simulacion-territorio`).
2. Suba **todo el contenido de esta carpeta** a la raíz del repositorio con *Add file → Upload files*. El archivo `index.html` debe quedar en la raíz.
3. Vaya a *Settings → Pages*. En *Source* elija **Deploy from a branch**, rama `main` y carpeta `/ (root)`, y luego **Save**.
4. En uno o dos minutos el sitio queda disponible en `https://<usuario>.github.io/ci-simulacion-territorio/`.

## Editar contenidos

Todas las preguntas, retos y fechas están en `js/data.js`:

- Pregunta de diagnóstico: `{ c: "competencia", q: "enunciado", o: [opciones], a: índiceCorrecto, e: "explicación" }`. El índice empieza en 0.
- Reto: `respuesta` es numérica. Se aceptan respuestas con coma o punto decimal.
- Cronograma: las fechas `ini` y `fin` usan el formato `AAAA-MM-DD`.

---
Núcleo de Matemáticas y Tecnología · ENSMA Girardot · 2026

## Publicar contenidos nuevos (sin tocar el diseño)

| Qué | Dónde se sube el archivo | Dónde se registra |
|---|---|---|
| Informe | `docs/informes/` (PDF y, opcional, DOCX y portada JPG) | `js/data.js` → `INFORMES` |
| Volumen de la revista | `docs/revista/` (PDF y, opcional, portada JPG) | `js/data.js` → `REVISTA` (completar `pdf`) |
| Red social | — | `js/data.js` → `REDES` (completar `url`) |
| Noticia o foto | `img/` | `js/data.js` → `NOTICIAS` o `GALERIA` |
