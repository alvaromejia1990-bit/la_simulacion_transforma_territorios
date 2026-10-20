# Guía: guardar los datos del sitio en Google Drive

Las respuestas de los estudiantes se guardan en una **hoja de cálculo de Google** que queda en tu Drive. La hoja tiene cuatro pestañas:

| Pestaña | Qué guarda |
|---|---|
| **Caracterización** | Nombre, grado, curso, edad, dispositivo e internet en casa |
| **Diagnósticos** | Nivel, aciertos, nota, desempeño, % por cada competencia y respuestas |
| **Retos** | Reto, respuesta dada, si fue correcta y número de intento |
| **Simulaciones** | Parámetros elegidos, resultados y conclusiones del estudiante |

La configuración se hace una sola vez y toma unos 10 minutos.

## 1. Crear la hoja en Drive
1. Entra a Google Drive con la cuenta institucional o la tuya.
2. Crea la hoja: **Nuevo → Hojas de cálculo de Google**. Ponle un nombre, por ejemplo `Base de datos – Simulación que transforma territorio (RACR)`.

## 2. Pegar el script
1. En la hoja, abre **Extensiones → Apps Script**.
2. Borra el código de ejemplo y pega todo el contenido del archivo `apps-script/Code.gs` de este repositorio.
3. Guarda con 💾 (o Ctrl + S).
4. En la lista de funciones de la barra superior elige **prepararHojas** y pulsa **Ejecutar**.
   - Google pedirá permisos. Pulsa **Revisar permisos**, elige tu cuenta y luego **Configuración avanzada → Ir a (nombre del proyecto) → Permitir**.
   - Al terminar, la hoja ya tiene las cuatro pestañas con sus encabezados.

## 3. Publicar como aplicación web
1. Pulsa **Implementar → Nueva implementación**.
2. En el engranaje ⚙ elige **Aplicación web** y configura:
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier usuario
3. Pulsa **Implementar** y copia la **URL de la aplicación web**. Termina en `/exec`.
4. Para comprobarla, pégala en el navegador. Debe aparecer `{"ok":true, ...}`.

## 4. Conectar el sitio
1. En GitHub, abre el archivo `js/config.js` y pulsa el lápiz ✏ para editarlo.
2. Pega la URL entre las comillas:
   ```js
   url: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```
3. Confirma con **Commit changes**. En uno o dos minutos el sitio publicado envía los datos a la hoja.

## Notas
- **Clave:** el sitio envía la clave `ENSMA-RACR-2026` y el script rechaza cualquier envío con otra clave. Si la cambias, hazlo en `apps-script/Code.gs` (`CLAVE`) y en `js/config.js` (`clave`), y vuelve a implementar.
- **Cambios en el script:** si modificas el código, usa **Implementar → Gestionar implementaciones → ✏ → Versión: Nueva versión**. Así la URL no cambia.
- **Sin conexión:** si un estudiante no tiene internet, sus registros quedan en el navegador y se envían solos cuando vuelve la conexión. El estado del envío se ve en **Mi progreso**.
- **Duplicados:** cada registro lleva un identificador único y el script no lo guarda dos veces.
- **Privacidad:** la hoja contiene datos de estudiantes menores de edad. Compártela solo con los docentes del núcleo y no la publiques.
