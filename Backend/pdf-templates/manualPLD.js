// pdf-templates/manualPLD.js
//
// Manual de usuario de la sección PLD, generado en HTML para que
// routes/pld.js lo convierta a PDF con Puppeteer (mismo patrón que
// generarHTMLDatosGenerales.js). Contenido estático — no recibe datos de
// ningún aviso ni escritura, así que no hay nada que escapar/inyectar.
//
// Todo lo que describe este manual corresponde a funcionalidad real ya
// construida (Dashboard de Control PLD, Detección automática, Expediente
// PLD de 7 pasos, Diagnóstico Jurídico) — no se documentan funciones que
// todavía no existen; donde algo está pendiente (catálogos SAT/UIF, aviso
// modificatorio, TXT DeclaraNot) se dice explícitamente que está pendiente.
const fs = require('fs');
const path = require('path');

function cargarLogoBase64() {
  try {
    const logoPath = path.join(__dirname, 'asstes', 'logo.png');
    if (fs.existsSync(logoPath)) {
      return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
    }
  } catch (e) {
    console.error('No se pudo cargar el logo para el manual PLD:', e.message);
  }
  return '';
}

// Capturas reales del sistema en ejecución (pdf-templates/asstes/manual/) —
// no son mockups: son pantallas tomadas directamente de la aplicación para
// que el manual muestre exactamente lo que el usuario va a ver, incluyendo
// datos de prueba reales ya presentes en el ambiente (comparecientes,
// estados, avisos del catálogo pendientes de cargar, etc.).
function cargarFiguraBase64(nombreArchivo) {
  try {
    const imgPath = path.join(__dirname, 'asstes', 'manual', nombreArchivo);
    if (fs.existsSync(imgPath)) {
      return `data:image/jpeg;base64,${fs.readFileSync(imgPath).toString('base64')}`;
    }
    console.error(`Captura no encontrada para el manual PLD: ${nombreArchivo}`);
  } catch (e) {
    console.error(`No se pudo cargar la captura "${nombreArchivo}" del manual PLD:`, e.message);
  }
  return '';
}

// Genera el bloque <figure> con la captura + pie de foto. Si el archivo no
// existe (entorno sin las capturas generadas) regresa cadena vacía en vez
// de un <img> roto — el manual sigue siendo válido sin figuras.
function figura(nombreArchivo, numero, titulo) {
  const src = cargarFiguraBase64(nombreArchivo);
  if (!src) return '';
  return `
    <figure class="figura">
      <img src="${src}" alt="${titulo}" />
      <figcaption>Figura ${numero} — ${titulo}</figcaption>
    </figure>`;
}

function generarHTMLManualPLD() {
  const logoSrc = cargarLogoBase64();
  const fechaGenerado = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Manual del módulo PLD</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    color: #111827;
    background: #ffffff;
  }
  body { padding: 0; }
  h1, h2, h3, h4 { font-weight: 600; color: #111827; }
  p, li { line-height: 1.5; }
  a { color: #2563eb; }

  /* ===== Portada ===== */
  .portada {
    height: 297mm; /* alto completo A4 — el PDF se genera con margen 0 (ver routes/pld.js) */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 20mm;
  }
  .portada img { height: 90px; margin-bottom: 10mm; }
  .portada .eyebrow { font-size: 11pt; color: #2563eb; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4mm; font-weight: 600; }
  .portada h1 { font-size: 26pt; margin-bottom: 6mm; color: #111827; }
  .portada .subtitulo { font-size: 13pt; color: #4b5563; max-width: 130mm; margin-bottom: 14mm; }
  .portada .meta { font-size: 9.5pt; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 5mm; width: 100mm; }

  /* ===== Tabla de contenido ===== */
  .toc { page-break-before: always; padding: 15mm 15mm 0; }
  .toc h2 { font-size: 16pt; margin-bottom: 8mm; border-bottom: 2px solid #2563eb; padding-bottom: 3mm; }
  .toc ol { list-style: none; counter-reset: toc; }
  .toc li { counter-increment: toc; padding: 2.2mm 0; font-size: 11pt; border-bottom: 1px dotted #e5e7eb; display: flex; }
  .toc li::before { content: counter(toc) ". "; font-weight: 600; color: #2563eb; margin-right: 2mm; }

  /* ===== Secciones =====
     A propósito SIN "page-break-before: always" aquí: forzar cada capítulo
     a una página nueva dejaba más de media página en blanco cada vez que
     un capítulo terminaba antes de llenar la hoja (11 capítulos, 11 saltos
     forzados). El contenido fluye natural y el navegador solo corta página
     cuando el contenido ya no cabe — igual que cualquier manual PDF
     normal. El título de capítulo (h2) sí lleva "page-break-after: avoid"
     para que nunca quede solo, huérfano, al pie de una página. */
  section.capitulo { padding: 8mm 15mm; }
  h2.titulo-capitulo {
    font-size: 16pt; color: #ffffff; background: #2563eb;
    padding: 4mm 6mm; border-radius: 3px; margin-bottom: 6mm;
    page-break-after: avoid; margin-top: 6mm;
  }
  h3.subtitulo { font-size: 12.5pt; margin-top: 7mm; margin-bottom: 3mm; color: #1d4ed8; }
  h4.subsubtitulo { font-size: 11pt; margin-top: 5mm; margin-bottom: 2mm; color: #111827; }
  p { margin-bottom: 3mm; text-align: justify; }
  ul, ol.normal { margin: 0 0 4mm 6mm; }
  ul.normal { margin: 0 0 4mm 6mm; }
  li { margin-bottom: 1.5mm; }

  .caja {
    border: 1px solid #d1d5db; border-left: 4px solid #2563eb;
    border-radius: 3px; padding: 4mm 5mm; margin: 4mm 0; background: #f8fafc;
    page-break-inside: avoid;
  }
  .caja.nota { border-left-color: #d97706; background: #fffbeb; }
  .caja.nota .etiqueta { color: #b45309; }
  .caja.pendiente { border-left-color: #dc2626; background: #fef2f2; }
  .caja.pendiente .etiqueta { color: #b91c1c; }
  .caja .etiqueta { font-weight: 700; color: #1d4ed8; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.05em; display: block; margin-bottom: 1.5mm; }

  /* page-break-inside: avoid en la tabla completa Y en cada fila: si la
     tabla entera no cabe en lo que resta de la página se empuja completa
     a la siguiente (nunca una fila cortada a la mitad, como pasaba antes
     con la tabla de nivel de riesgo entre dos páginas). */
  table.tabla { width: 100%; border-collapse: collapse; margin: 4mm 0; font-size: 9.5pt; page-break-inside: avoid; }
  table.tabla th, table.tabla td { border: 1px solid #d1d5db; padding: 2.5mm 3mm; text-align: left; vertical-align: top; }
  table.tabla th { background: #f3f4f6; font-weight: 600; color: #374151; }
  table.tabla tr:nth-child(even) td { background: #fafafa; }
  table.tabla tr { page-break-inside: avoid; }
  table.tabla thead { display: table-header-group; }

  .chip { display: inline-block; padding: 0.5mm 2.5mm; border-radius: 10px; font-size: 8.5pt; font-weight: 600; color: #ffffff; }
  .chip.gris { background: #6b7280; }
  .chip.naranja { background: #d97706; }
  .chip.azul { background: #2563eb; }
  .chip.rojo { background: #dc2626; }
  .chip.verde { background: #16a34a; }

  .paso {
    display: flex; gap: 3mm; margin-bottom: 4mm; page-break-inside: avoid;
  }
  .paso .num {
    flex-shrink: 0; width: 7mm; height: 7mm; border-radius: 50%; background: #2563eb; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9.5pt;
  }

  .footer-pagina { font-size: 8pt; color: #9ca3af; text-align: center; margin-top: 8mm; }

  .figura {
    margin: 5mm 0 6mm; page-break-inside: avoid; text-align: center;
  }
  .figura img {
    width: 100%; max-width: 165mm; border: 1px solid #d1d5db; border-radius: 3px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  .figura figcaption {
    font-size: 8.5pt; color: #6b7280; margin-top: 2mm; font-style: italic;
  }
</style>
</head>
<body>

<!-- ===================== PORTADA ===================== -->
<div class="portada">
  ${logoSrc ? `<img src="${logoSrc}" alt="Notaría 17" />` : ''}
  <div class="eyebrow">Sistema Notarial — Notaría Pública No. 17</div>
  <h1>Manual del Módulo PLD</h1>
  <div class="subtitulo">
    Guía completa de uso de la sección de Prevención de Lavado de Dinero: Panel de Control,
    Detección Automática, Expediente PLD y Diagnóstico Jurídico Inteligente.
  </div>
  <div class="meta">Generado el ${fechaGenerado}</div>
</div>

<!-- ===================== TABLA DE CONTENIDO ===================== -->
<div class="toc">
  <h2>Contenido</h2>
  <ol>
    <li>Introducción y propósito del módulo</li>
    <li>Cómo entrar a la sección PLD</li>
    <li>Panel de Control PLD</li>
    <li>Detección Automática</li>
    <li>El Expediente PLD — las 7 pantallas</li>
    <li>Diagnóstico Jurídico Inteligente</li>
    <li>Ciclo de vida de un aviso</li>
    <li>Roles y permisos</li>
    <li>Flujo recomendado, paso a paso</li>
    <li>Preguntas frecuentes y limitaciones conocidas</li>
    <li>Glosario</li>
  </ol>
</div>

<!-- ===================== 1. INTRODUCCIÓN ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">1. Introducción y propósito del módulo</h2>
  <p>
    El módulo PLD (Prevención de Lavado de Dinero) automatiza el cumplimiento de la Notaría frente a la
    <strong>LFPIORPI</strong> (Ley Federal para la Prevención e Identificación de Operaciones con Recursos de
    Procedencia Ilícita): detecta qué escrituras generan obligación de aviso ante la UIF/SAT, ayuda a construir
    el expediente de cada operación, genera el XML para el portal SPPLD y lleva el registro de acuses, rechazos
    y auditoría de cada aviso.
  </p>
  <p>
    El módulo <strong>nunca transmite nada al SAT de forma automática</strong>: el SAT no ofrece una API pública
    para el SPPLD, así que subir el XML y firmarlo sigue siendo un paso manual del abogado en el portal del SAT.
    El sistema se encarga de todo lo anterior — detectar, documentar, generar el XML correcto y llevar la
    trazabilidad — para que ese último paso manual sea lo único que quede por hacer.
  </p>
  <div class="caja">
    <span class="etiqueta">Regla de oro</span>
    El módulo PLD <strong>lee</strong> el estado de las Escrituras pero nunca bloquea ni modifica el flujo notarial
    existente (Escrituras, Protocolito, Recibos). Las obligaciones PLD se gestionan en paralelo, nunca como un
    requisito para guardar una escritura.
  </div>
  <h3 class="subtitulo">¿Dónde vive la información?</h3>
  <p>
    Cada operación sujeta a PLD genera un registro llamado <strong>Aviso PLD</strong>, ligado a la Escritura que
    le dio origen. Un Aviso PLD guarda: el fundamento legal de por qué aplica, los comparecientes, los datos de
    la actividad, el XML generado (con historial de versiones), el acuse del SAT una vez presentado, y un
    <strong>historial de auditoría</strong> permanente de cada cambio de estado — este historial nunca se puede
    borrar ni editar, solo se le agregan eventos nuevos (diseño "append-only").
  </p>
</section>

<!-- ===================== 2. CÓMO ENTRAR ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">2. Cómo entrar a la sección PLD</h2>
  <p>En el menú lateral izquierdo del sistema:</p>
  <div class="paso"><div class="num">1</div><div>Abre el submenú <strong>Escrituras</strong>.</div></div>
  <div class="paso"><div class="num">2</div><div>Haz clic en <strong>Expedientes PLD</strong>.</div></div>
  <p>
    La sección se abre con dos pestañas en la parte superior: <strong>Panel de Control</strong> (la vista
    principal, abierta por defecto) y <strong>Detección Automática</strong>. Ambas comparten el mismo expediente
    detrás — solo cambia de dónde parte la lista.
  </p>
  <div class="caja nota">
    <span class="etiqueta">Visibilidad</span>
    Hoy la sección "Expedientes PLD" del menú solo la ve el rol <strong>Administrador</strong> del sistema. Dentro
    del módulo, cada pantalla además respeta los permisos PLD descritos en el capítulo 8 (Roles y permisos).
  </div>
  <p>
    También se puede llegar a un expediente puntual desde la columna <strong>PLD</strong> del listado de
    Escrituras: cada fila con obligación PLD muestra un botón con el estado del aviso ("Evaluar PLD", "XML
    generado", "Presentado", etc.) que abre el mismo Expediente PLD que se explica en el capítulo 5.
  </p>
</section>

<!-- ===================== 3. PANEL DE CONTROL ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">3. Panel de Control PLD</h2>
  <p>
    Es la vista operativa: un tablero para monitorear todos los Avisos PLD que ya existen, con métricas, filtros,
    búsqueda, orden y acciones rápidas. Nace de los Avisos PLD ya creados — no incluye escrituras que todavía no
    tienen expediente (para eso está la pestaña de Detección Automática, capítulo 4).
  </p>

  ${figura('01-panel-control.jpg', 1, 'Panel de Control PLD — tarjetas de métricas, filtros y tabla de avisos.')}

  <h3 class="subtitulo">3.1 Tarjetas de métricas</h3>
  <p>En la parte superior aparecen siete tarjetas con conteos en tiempo real:</p>
  <table class="tabla">
    <thead><tr><th>Tarjeta</th><th>Qué cuenta</th></tr></thead>
    <tbody>
      <tr><td><strong>Total de avisos</strong></td><td>Todos los Avisos PLD que cumplen los filtros activos.</td></tr>
      <tr><td><strong>Pendientes</strong></td><td>Avisos en estado Pendiente, Pendiente (DeclaraNot) o Listo — todavía no llegan a generar XML.</td></tr>
      <tr><td><strong>XML generados</strong></td><td>Avisos actualmente en estado "XML generado" — listos para subir al SPPLD.</td></tr>
      <tr><td><strong>Presentados</strong></td><td>Avisos ya presentados ante el SAT, con acuse registrado.</td></tr>
      <tr><td><strong>Rechazados</strong></td><td>Avisos que el SAT rechazó al subir el XML.</td></tr>
      <tr><td><strong>Acuses registrados</strong></td><td>Avisos que ya tienen un PDF de acuse guardado en el sistema.</td></tr>
      <tr><td><strong>Vencidos</strong></td><td>Avisos cuya fecha límite ya pasó y que todavía no están Presentados, Cancelados o marcados como No aplica.</td></tr>
    </tbody>
  </table>
  <p>
    Las cuatro tarjetas de estado (Pendientes, XML generados, Presentados, Rechazados) son además un
    <strong>atajo de filtro</strong>: un clic sobre la tarjeta filtra la tabla por ese estado; un segundo clic
    quita el filtro. Las tarjetas respetan los demás filtros activos (fechas, tipo de acto, etc.) pero
    <strong>ignoran el filtro de Estado</strong> a propósito, para que siempre muestren el desglose completo sin
    importar qué estado esté filtrado en la tabla en ese momento.
  </p>

  <h3 class="subtitulo">3.2 Filtros y búsqueda</h3>
  <ul class="normal">
    <li><strong>Búsqueda instantánea</strong> — busca por número de control, tipo de acto, abogado responsable o folio del SAT, con resultados casi en tiempo real (una pequeña pausa mientras se deja de escribir).</li>
    <li><strong>Estado</strong> — filtra por el estado exacto del aviso.</li>
    <li><strong>Desde / Hasta</strong> — rango de fechas sobre la fecha de operación de la escritura.</li>
    <li><strong>Tipo de acto</strong> — texto libre contra la actividad detectada (p. ej. "poder", "donación").</li>
    <li><strong>Núm. de escritura</strong> — número de control exacto.</li>
    <li><strong>Compareciente</strong> — busca por nombre de cualquier compareciente ya capturado en el expediente.</li>
    <li><strong>Abogado responsable</strong> — solo visible para roles que pueden ver todos los expedientes (Administrador / Oficial de Cumplimiento); el resto de roles ya está limitado a sus propios avisos.</li>
  </ul>
  <p>El botón <strong>Limpiar</strong> borra todos los filtros de un solo clic.</p>

  <h3 class="subtitulo">3.3 La tabla</h3>
  <p>
    Columnas: Número de control, Tipo de acto, Compareciente(s), Responsable, Estado, Fecha de operación, Fecha
    límite (en rojo si ya venció, en verde si falta tiempo) y Acciones. Se puede ordenar haciendo clic en
    cualquier encabezado de columna, y la tabla pagina del lado del servidor (se puede cambiar cuántas filas se
    muestran por página en la parte inferior).
  </p>

  <h3 class="subtitulo">3.4 Acciones rápidas por fila</h3>
  <p>
    Cada fila tiene un ícono de ojo (abre el expediente completo, ver capítulo 5) y un menú de tres puntos con
    acciones que cambian según el estado del aviso — nunca se muestra una acción que el sistema fuera a rechazar:
  </p>
  <table class="tabla">
    <thead><tr><th>Acción</th><th>Cuándo aparece</th></tr></thead>
    <tbody>
      <tr><td>Generar / Regenerar XML</td><td>Estado Pendiente, Listo o XML generado, y el usuario tiene permiso para presentar avisos.</td></tr>
      <tr><td>Descargar XML</td><td>El aviso ya tiene al menos una versión de XML generada.</td></tr>
      <tr><td>Registrar acuse</td><td>Estado "XML generado" — abre el expediente directo en la pantalla de Acuse.</td></tr>
      <tr><td>Descargar acuse</td><td>Estado Presentado (ya tiene el PDF del acuse guardado).</td></tr>
      <tr><td>Ver historial</td><td>Siempre disponible — abre el expediente directo en la pantalla de Historial.</td></tr>
      <tr><td>Reintentar</td><td>Aparece deshabilitada en estado Rechazado — ver nota de limitaciones conocidas, capítulo 10.</td></tr>
    </tbody>
  </table>
</section>

<!-- ===================== 4. DETECCIÓN AUTOMÁTICA ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">4. Detección Automática</h2>
  <p>
    Esta pestaña responde una pregunta distinta a la del Panel de Control: <strong>"de todas las Escrituras del
    sistema, ¿cuáles están sujetas a PLD?"</strong> — incluyendo las que todavía no tienen expediente abierto.
    La fuente de esta lista es el <strong>Motor de Reglas</strong>, que evalúa cada Escritura contra las reglas
    jurídicas vigentes (poder irrevocable, donación, compraventa, fideicomiso, fusión/escisión, mutuo, sucesión,
    etc.) sin necesidad de que exista todavía un Aviso PLD.
  </p>

  ${figura('02-deteccion-automatica.jpg', 2, 'Detección Automática — escrituras sujetas a PLD detectadas por el Motor de Reglas.')}

  <p>Cada fila puede aparecer con uno de estos estados:</p>
  <ul class="normal">
    <li><span class="chip gris">Pendiente de iniciar</span> — el motor detectó que aplica PLD, pero nadie ha abierto el expediente todavía.</li>
    <li><span class="chip naranja">Requiere revisión</span> — el motor no pudo decidir solo (falta un dato, o el tipo de trámite no se reconoce con certeza) y necesita que un humano lo revise.</li>
    <li>Cualquier estado real de Aviso PLD, si el expediente ya se abrió — en ese caso el aviso ya existente manda: no se vuelve a evaluar con el motor aunque la regla vigente haya cambiado desde entonces.</li>
  </ul>
  <p>
    Al hacer clic en cualquier fila se abre el Expediente PLD correspondiente; si todavía no existe un Aviso PLD,
    el sistema lo crea en ese momento — nunca antes, solo por mirar la lista.
  </p>
  <div class="caja">
    <span class="etiqueta">Resumen superior</span>
    Arriba de la tabla aparece un resumen: cuántas escrituras se evaluaron en total, cuántas están pendientes de
    iniciar, cuántas requieren revisión y cuántas ya tienen expediente abierto.
  </div>
</section>

<!-- ===================== 5. EXPEDIENTE PLD ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">5. El Expediente PLD — las 7 pantallas</h2>
  <p>
    Al abrir un aviso (desde cualquiera de las dos pestañas, o desde la columna PLD de Escrituras) se despliega
    el Expediente PLD completo: a la izquierda un panel fijo de estado y acciones rápidas, al centro el contenido
    de la pantalla activa organizada en 7 pasos, y a la derecha el panel de Diagnóstico Jurídico (capítulo 6).
    Los 7 pasos son:
  </p>

  ${figura('03-expediente-dashboard.jpg', 3, 'Expediente PLD — Dashboard, con el panel de estado (izquierda) y el Diagnóstico Jurídico (derecha).')}

  <h3 class="subtitulo">5.1 Dashboard</h3>
  <p>
    Vista ejecutiva de solo lectura: estado actual, porcentaje de avance del ciclo del aviso, información básica
    de la escritura (número de control, tipo de trámite, fecha, monto, responsable), un checklist resumido de lo
    que falta, y accesos directos a las demás pantallas.
  </p>

  <h3 class="subtitulo">5.2 Datos generales (Comparecientes)</h3>
  <p>
    Aquí se capturan las personas que intervienen en el acto (Poderdante/Apoderado, Cedente/Cesionario,
    Acreedor/Deudor, según el tipo de actividad). Por cada compareciente se indica:
  </p>
  <ul class="normal">
    <li>Tipo de persona (física o moral) y Rol en la operación.</li>
    <li>Nacionalidad (catálogo oficial de países ISO).</li>
    <li>Persona física: nombre, apellido paterno, apellido materno, actividad económica (código SAT de 7 dígitos, cuando el rol lo requiere), fecha de nacimiento, RFC, CURP.</li>
    <li>Persona moral: denominación o razón social, fecha de constitución, giro mercantil (código SAT).</li>
  </ul>

  ${figura('04-datos-generales.jpg', 4, 'Datos generales — captura de un compareciente con su rol.')}

  <p>El botón <strong>Guardar cambios</strong> actualiza el aviso de inmediato — no hace falta pasar a otra pantalla.</p>

  <h3 class="subtitulo">5.3 Actividad</h3>
  <p>
    Datos específicos del tipo de acto que no caben en "comparecientes" ni en "monto": por ejemplo, para un
    <em>poder</em> se captura el Tipo de poder (catálogo oficial); para una <em>cesión de derechos de
    fideicomiso</em>, el tipo de cesión, el monto de la cesión y los datos del fideicomiso; para un
    <em>mutuo/crédito</em>, el tipo de otorgamiento y la moneda. En todos los casos se captura también el
    <strong>Tipo de alerta (UIF)</strong>, obligatorio para cualquier aviso.
  </p>
  <div class="caja nota">
    <span class="etiqueta">Catálogos oficiales</span>
    Los catálogos de la UIF/SAT (tipo de poder, tipo de cesión, tipo de otorgamiento, moneda, tipo de alerta)
    están preparados en el sistema pero <strong>pendientes de cargar con los valores oficiales</strong>. Mientras
    un catálogo esté vacío, el campo correspondiente se muestra como no disponible — el sistema nunca inventa
    valores de catálogo.
  </div>

  ${figura('05-actividad.jpg', 5, 'Actividad — campos específicos del tipo de acto (aquí, con los catálogos oficiales todavía pendientes de cargar).')}

  <h3 class="subtitulo">5.4 Validaciones</h3>
  <p>
    Checklist inteligente agrupado por categoría (Comparecientes, Datos Generales, Actividad): muestra tanto lo
    ya cumplido como lo pendiente, con un mensaje en lenguaje natural y un enlace directo a la pantalla donde se
    corrige. También indica en una frase qué falta para poder Generar el XML y qué falta para poder Enviar al
    SAT.
  </p>

  ${figura('06-validaciones.jpg', 6, 'Validaciones — checklist agrupado, con lo cumplido y lo pendiente.')}

  <h3 class="subtitulo">5.5 XML</h3>
  <p>
    Genera el XML conforme al esquema oficial <code>fep.xsd</code> del SPPLD. El botón "Generar XML" solo se
    habilita cuando no falta ningún dato obligatorio; si el backend encuentra un problema de formato que la
    pantalla no alcanzó a detectar (RFC, CURP, fecha, nacionalidad sin código ISO, etc.) lo dice explícitamente,
    sin inventar una corrección. Cada generación queda numerada como una nueva versión, con quién la generó y
    cuándo. El botón "Descargar XML" siempre trae la versión activa más reciente.
  </p>

  ${figura('07-xml.jpg', 7, 'XML — antes de generar, el sistema explica qué falta y aclara que nunca se envía solo.')}

  <div class="caja">
    <span class="etiqueta">Importante</span>
    Generar el XML <strong>nunca lo envía al SAT</strong>. El siguiente paso — subirlo al portal SPPLD y firmarlo
    con e.firma — sigue siendo manual, fuera del sistema.
  </div>

  <h3 class="subtitulo">5.6 Acuse</h3>
  <p>
    Una vez que el XML está generado y el abogado lo subió y firmó manualmente en el portal SPPLD, aquí se
    registra el resultado:
  </p>
  <ul class="normal">
    <li><strong>Registrar acuse</strong> — folio del aviso (SAT), folio de portal (opcional) y el PDF del acuse. El aviso pasa a estado <span class="chip verde">Presentado</span>.</li>
    <li><strong>Marcar como rechazado por el SAT</strong> — motivo del rechazo. El aviso pasa a estado <span class="chip rojo">Rechazado SPPLD</span>.</li>
  </ul>
  <p>
    Ambas acciones solo están disponibles mientras el aviso está en estado "XML generado". Una vez que se
    registra el resultado (presentado o rechazado), <strong>el expediente queda cerrado y ya no se puede
    editar</strong> — es un diseño intencional de integridad de auditoría, ver capítulo 10.
  </p>

  ${figura('08-acuse-pendiente.jpg', 8, 'Acuse — mientras no hay XML generado, la pantalla explica el siguiente paso en vez de mostrar un formulario que fallaría.')}

  <h3 class="subtitulo">5.7 Historial</h3>
  <p>
    Línea de tiempo (timeline) cronológica y permanente de todo lo que le ha pasado al aviso: detección
    automática, cada guardado de comparecientes o actividad, cada versión de XML generada (con quién la generó),
    el registro del acuse o del rechazo — todo con fecha, usuario y una nota explicativa. Es un registro
    "append-only": nunca se borra ni se edita un evento, solo se agregan eventos nuevos.
  </p>

  ${figura('09-historial.jpg', 9, 'Historial — línea de tiempo con la detección automática y un guardado de comparecientes.')}
</section>

<!-- ===================== 6. DIAGNÓSTICO JURÍDICO ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">6. Diagnóstico Jurídico Inteligente</h2>
  <p>
    Es el panel fijo del lado derecho del Expediente PLD, visible en las 7 pantallas sin importar cuál esté
    activa. Se recalcula automáticamente cada vez que se guarda un cambio en el expediente (comparecientes,
    actividad, generación de XML, registro de acuse). Combina dos fuentes que el sistema mantiene deliberadamente
    separadas (puede verse en la columna derecha de la Figura 3, capítulo 5):
  </p>
  <ul class="normal">
    <li><strong>Diagnóstico legal</strong> — resultado del Motor de Reglas evaluando la Escritura: si aplica PLD, por qué (fundamento e inciso legal), el umbral económico si corresponde, los documentos que la regla exige y las advertencias jurídicas propias de ese tipo de acto.</li>
    <li><strong>Completitud operativa</strong> — si ya se capturó lo necesario en el expediente para poder generar el XML (mismos datos que la pantalla de Validaciones).</li>
  </ul>
  <p>El panel muestra ocho bloques de información:</p>
  <table class="tabla">
    <thead><tr><th>#</th><th>Bloque</th><th>Contenido</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>Veredicto</td><td>"Genera Aviso PLD" / "No genera Aviso PLD" / "Requiere revisión manual".</td></tr>
      <tr><td>2</td><td>Fundamento</td><td>El inciso legal aplicable y la explicación de por qué (incluye el umbral y el valor analizado cuando aplica un monto).</td></tr>
      <tr><td>3</td><td>Requisitos del expediente</td><td>Porcentaje de avance y checklist de lo que falta capturar.</td></tr>
      <tr><td>4</td><td>Documentos requeridos</td><td>Lista de documentos que la regla exige para este tipo de acto, marcados como pendientes de verificación manual — el sistema no rastrea automáticamente qué documentos físicos ya se recibieron.</td></tr>
      <tr><td>5</td><td>Validaciones pendientes</td><td>Mismos datos que la pantalla de Validaciones, en formato de lista.</td></tr>
      <tr><td>6</td><td>Advertencias jurídicas</td><td>Alertas propias de la regla aplicable (por ejemplo, riesgo de subvaluación en una donación).</td></tr>
      <tr><td>7</td><td>Nivel de riesgo</td><td>Bajo / Medio / Alto — ver criterio abajo.</td></tr>
      <tr><td>8</td><td>Acciones recomendadas</td><td>Lista de próximos pasos concretos, cada uno con un enlace directo a la pantalla donde se resuelve.</td></tr>
    </tbody>
  </table>

  <h3 class="subtitulo">Cómo se calcula el nivel de riesgo</h3>
  <p>
    El nivel de riesgo <strong>no es un criterio legal nuevo</strong> — es una capa de prioridad visual construida
    únicamente a partir de datos que el sistema ya calculó (nunca inventa un criterio adicional):
  </p>
  <table class="tabla">
    <thead><tr><th>Nivel</th><th>Cuándo aplica</th></tr></thead>
    <tbody>
      <tr><td><span class="chip rojo">Alto</span></td><td>El motor no pudo decidir si aplica PLD (requiere revisión manual), o la detección automática marcó "requiere revisión", o la fecha límite ya venció sin que el aviso esté resuelto, o el SAT ya rechazó el aviso.</td></tr>
      <tr><td><span class="chip naranja">Medio</span></td><td>Sí aplica PLD, no está vencido, pero todavía faltan datos que pide la regla o hay advertencias jurídicas sin resolver.</td></tr>
      <tr><td><span class="chip verde">Bajo</span></td><td>No genera obligación PLD, o el aviso ya llegó a un estado terminal sin pendientes (Presentado, No aplica, Cancelado), o aplica PLD pero está completamente al día.</td></tr>
    </tbody>
  </table>
</section>

<!-- ===================== 7. CICLO DE VIDA ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">7. Ciclo de vida de un aviso</h2>
  <table class="tabla">
    <thead><tr><th>Estado</th><th>Significado</th></tr></thead>
    <tbody>
      <tr><td><span class="chip naranja">Pendiente</span></td><td>Detectado automáticamente; falta capturar datos.</td></tr>
      <tr><td><span class="chip gris">Pendiente (DeclaraNot)</span></td><td>Aviso cuyo portal de destino es DeclaraNot en vez de SPPLD (flujo fiscal separado).</td></tr>
      <tr><td><span class="chip azul">Listo</span></td><td>Datos completos, todavía sin XML generado.</td></tr>
      <tr><td><span class="chip azul">XML generado</span></td><td>El XML ya existe; falta subirlo al SAT y registrar el resultado.</td></tr>
      <tr><td><span class="chip verde">Presentado</span></td><td>Acuse registrado — expediente cerrado, inmutable.</td></tr>
      <tr><td><span class="chip rojo">Rechazado SPPLD</span></td><td>El SAT rechazó el aviso — expediente cerrado, inmutable.</td></tr>
      <tr><td><span class="chip gris">No aplica</span></td><td>El motor determinó que esta escritura no genera obligación PLD.</td></tr>
      <tr><td><span class="chip gris">Cancelado</span></td><td>El aviso se canceló (por ejemplo, porque se borró la escritura que le dio origen).</td></tr>
    </tbody>
  </table>
  <p>
    Los estados <strong>Presentado</strong>, <strong>Rechazado SPPLD</strong> y <strong>Cancelado</strong> son
    inmutables: una vez ahí, ya no se pueden editar comparecientes ni actividad. Esto es intencional — protege
    la integridad del expediente una vez que ya se le dio una respuesta oficial.
  </p>
</section>

<!-- ===================== 8. ROLES ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">8. Roles y permisos</h2>
  <table class="tabla">
    <thead><tr><th>Rol PLD</th><th>Ve</th><th>Puede editar</th><th>Puede generar XML / presentar</th><th>Puede cancelar</th></tr></thead>
    <tbody>
      <tr><td>Administrador</td><td>Todos los avisos</td><td>Sí</td><td>Sí</td><td>Sí</td></tr>
      <tr><td>Oficial de Cumplimiento</td><td>Todos los avisos</td><td>Sí</td><td>Sí</td><td>Sí</td></tr>
      <tr><td>Notario (Abogado)</td><td>Solo sus propios avisos</td><td>Sí</td><td>Sí</td><td>Sí</td></tr>
      <tr><td>Capturista (Asistente)</td><td>Solo sus propios avisos</td><td>Sí</td><td>No</td><td>No</td></tr>
      <tr><td>Consulta</td><td>Sin acceso</td><td>No</td><td>No</td><td>No</td></tr>
    </tbody>
  </table>
  <p>
    El rol PLD se calcula a partir del rol del sistema del usuario (Administrador → Administrador, Abogado →
    Notario, Asistente → Capturista, Protocolito/Recepción → Consulta). El sistema nunca muestra un botón de una
    acción que el backend fuera a rechazar por permisos.
  </p>
</section>

<!-- ===================== 9. FLUJO RECOMENDADO ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">9. Flujo recomendado, paso a paso</h2>
  <div class="paso"><div class="num">1</div><div>La Escritura se guarda normalmente en el módulo de Escrituras — el sistema detecta en automático si genera obligación PLD.</div></div>
  <div class="paso"><div class="num">2</div><div>Desde la columna PLD de Escrituras, o desde Detección Automática, se abre el Expediente PLD (si no existe todavía, se crea en ese momento).</div></div>
  <div class="paso"><div class="num">3</div><div>En Datos generales se capturan los comparecientes con su rol correspondiente.</div></div>
  <div class="paso"><div class="num">4</div><div>En Actividad se capturan los datos específicos del tipo de acto y el tipo de alerta UIF.</div></div>
  <div class="paso"><div class="num">5</div><div>En Validaciones (o en el panel de Diagnóstico Jurídico) se revisa que no falte nada.</div></div>
  <div class="paso"><div class="num">6</div><div>En XML se genera el archivo y se descarga.</div></div>
  <div class="paso"><div class="num">7</div><div>Fuera del sistema: se sube el XML al portal SPPLD y se firma con e.firma.</div></div>
  <div class="paso"><div class="num">8</div><div>De vuelta en el sistema, en Acuse se registra el folio y el PDF del acuse del SAT (o se marca el rechazo, si aplica).</div></div>
  <div class="paso"><div class="num">9</div><div>El expediente queda cerrado; todo el proceso queda documentado en Historial.</div></div>
</section>

<!-- ===================== 10. PREGUNTAS FRECUENTES ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">10. Preguntas frecuentes y limitaciones conocidas</h2>

  <h4 class="subsubtitulo">¿Por qué no puedo editar un aviso Presentado o Rechazado?</h4>
  <p>
    Es intencional. Una vez que el SAT ya recibió una respuesta (positiva o negativa), el expediente se congela
    para proteger la trazabilidad. Corregir un aviso rechazado requeriría presentar un
    <strong>aviso modificatorio</strong> — el modelo de datos ya reserva espacio para esa funcionalidad, pero
    todavía no está construida en el sistema. Por eso el botón "Reintentar" aparece deshabilitado.
  </p>

  <h4 class="subsubtitulo">¿Por qué algunos catálogos aparecen vacíos?</h4>
  <p>
    Los catálogos oficiales SAT/UIF (tipo de poder, tipo de cesión, tipo de otorgamiento, moneda, tipo de alerta)
    están preparados técnicamente pero pendientes de cargar con los valores oficiales publicados por la
    autoridad. Mientras un catálogo esté vacío, no se puede generar el XML para los tipos de acto que dependen de
    él — el sistema nunca inventa un valor de catálogo para evitar ese bloqueo.
  </p>

  <h4 class="subsubtitulo">¿El sistema rastrea qué documentos físicos ya se recibieron?</h4>
  <p>
    No todavía. El Diagnóstico Jurídico y el motor de reglas indican <em>qué</em> documentos exige la ley para
    cada tipo de acto, pero no hay una casilla de "recibido / pendiente" por documento — esa verificación sigue
    siendo manual.
  </p>

  <h4 class="subsubtitulo">¿Se puede generar el TXT para DeclaraNot desde aquí?</h4>
  <p>
    No todavía. El sistema distingue el portal SPPLD (LFPIORPI, este manual) del sistema DeclaraNot (obligación
    fiscal distinta, Art. 27 CFF) — el generador de TXT para DeclaraNot está identificado como trabajo futuro.
  </p>

  <h4 class="subsubtitulo">¿Qué pasa si borro una Escritura que ya tiene Aviso PLD?</h4>
  <p>
    El Aviso PLD no se borra — por diseño de auditoría, un Aviso PLD nunca se elimina. Se cancela automáticamente
    (estado "Cancelado"), salvo que ya esté en un estado inmutable como Presentado.
  </p>
</section>

<!-- ===================== 11. GLOSARIO ===================== -->
<section class="capitulo">
  <h2 class="titulo-capitulo">11. Glosario</h2>
  <table class="tabla">
    <tbody>
      <tr><td style="width:32%"><strong>LFPIORPI</strong></td><td>Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita.</td></tr>
      <tr><td><strong>UIF</strong></td><td>Unidad de Inteligencia Financiera, adscrita a la SHCP — autoridad que recibe los avisos.</td></tr>
      <tr><td><strong>SPPLD</strong></td><td>Sistema del Portal de Prevención de Lavado de Dinero — portal del SAT donde se suben los avisos PLD.</td></tr>
      <tr><td><strong>DeclaraNot</strong></td><td>Sistema del SAT para declaraciones fiscales de actos notariales (obligación distinta, CFF Art. 27).</td></tr>
      <tr><td><strong>fep.xsd</strong></td><td>Esquema XML oficial que deben cumplir los avisos del SPPLD.</td></tr>
      <tr><td><strong>UMA</strong></td><td>Unidad de Medida y Actualización — unidad con la que se expresan los umbrales económicos de la ley.</td></tr>
      <tr><td><strong>Motor de Reglas</strong></td><td>Componente que evalúa una Escritura y determina si genera obligación PLD, con qué fundamento y qué requisitos aplican.</td></tr>
      <tr><td><strong>Aviso PLD</strong></td><td>Registro del sistema que documenta una operación sujeta a PLD, desde su detección hasta su presentación ante el SAT.</td></tr>
      <tr><td><strong>tipoFEP</strong></td><td>Código que identifica el tipo de actividad dentro del esquema fep.xsd (por ejemplo, poder, cesión de fideicomiso, mutuo).</td></tr>
      <tr><td><strong>Diagnóstico Jurídico</strong></td><td>Panel del Expediente PLD que combina el veredicto del Motor de Reglas con la completitud operativa del expediente.</td></tr>
    </tbody>
  </table>
  <p class="footer-pagina">Manual generado automáticamente por el Sistema Notarial — Notaría Pública No. 17, Ciudad Juárez, Chihuahua.</p>
</section>

</body>
</html>`;
}

module.exports = { generarHTMLManualPLD };
