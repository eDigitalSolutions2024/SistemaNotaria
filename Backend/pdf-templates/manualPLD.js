// pdf-templates/manualPLD.js
//
// Manual de usuario de la sección PLD, generado en HTML para que
// routes/pld.js lo convierta a PDF con Puppeteer (mismo patrón que
// generarHTMLDatosGenerales.js). Contenido estático — no recibe datos de
// ningún aviso ni escritura, así que no hay nada que escapar/inyectar.
//
// Rediseño completo (v2): márgenes de página reales de 25mm en los cuatro
// lados (ver routes/pld.js, page.pdf({ margin })), tipografía y jerarquía
// visual tipo documentación de producto (Stripe/Microsoft Learn), cajas de
// nota/consejo/advertencia/importante, tablas de referencia y 16 capturas
// reales del sistema en ejecución (pdf-templates/asstes/manual/).
//
// Todo lo que describe este manual corresponde a funcionalidad real ya
// construida — no se documentan funciones que todavía no existen; donde
// algo está pendiente (catálogos SAT/UIF, aviso modificatorio, TXT
// DeclaraNot) se dice explícitamente que está pendiente, nunca se inventa
// un comportamiento.
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
// datos de prueba reales ya presentes en el ambiente.
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
      <figcaption><strong>Figura ${numero}.</strong> ${titulo}</figcaption>
    </figure>`;
}

// Cajas de admonición — mismo patrón visual en las 4 variantes, solo cambia
// color/etiqueta/ícono. `tipo`: nota | consejo | advertencia | importante.
const CALLOUT_META = {
  nota:        { etiqueta: 'Nota',        icono: 'i' },
  consejo:     { etiqueta: 'Consejo',     icono: '✓' },
  advertencia: { etiqueta: 'Advertencia', icono: '!' },
  importante:  { etiqueta: 'Importante',  icono: '‼' },
};
function callout(tipo, html) {
  const meta = CALLOUT_META[tipo] || CALLOUT_META.nota;
  return `
    <div class="callout ${tipo}">
      <div class="callout-icono">${meta.icono}</div>
      <div class="callout-cuerpo">
        <div class="callout-etiqueta">${meta.etiqueta}</div>
        ${html}
      </div>
    </div>`;
}

// Tabla de referencia de campos de un formulario (Acuse) — deliberadamente
// NO usa el estilo de "figura" (foto con borde y sombra): es un esquema de
// campos construido con el mismo lenguaje visual del manual, no una
// captura de pantalla. Se usa para los 2-3 estados del Expediente PLD que
// hoy no se pueden volver a producir con datos de prueba en vivo (el único
// aviso que llegó a Presentado/Rechazado en este ambiente quedó huérfano
// porque su Escritura de origen ya fue eliminada) — así se documenta el
// formulario con precisión, sin fabricar una captura de un estado que no
// existe de verdad en el ambiente actual.
function tablaCampos(titulo, filas) {
  const cuerpo = filas.map(([campo, tipo, detalle]) => `
      <tr><td><strong>${campo}</strong></td><td>${tipo}</td><td>${detalle}</td></tr>`).join('');
  return `
    <div class="campo-ref">
      <div class="campo-ref-titulo">Campos del formulario «${titulo}»</div>
      <table class="tabla tabla-campos">
        <thead><tr><th>Campo</th><th>Tipo</th><th>Qué significa</th></tr></thead>
        <tbody>${cuerpo}</tbody>
      </table>
    </div>`;
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
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    color: #1e293b;
    background: #ffffff;
  }
  h1, h2, h3, h4 { font-weight: 700; color: #0f172a; margin: 0; }
  p { margin: 0 0 3.5mm; line-height: 1.65; }
  li { line-height: 1.6; margin-bottom: 1.8mm; }
  ul, ol.normal { margin: 0 0 4mm 5.5mm; padding: 0; }
  a { color: #2563eb; }
  strong { color: #0f172a; }
  code {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 3px;
    padding: 0.3mm 1.3mm; font-size: 92%; color: #0f172a;
  }

  /* ===== Portada ===== */
  .portada {
    min-height: 247mm; /* alto de página imprimible con márgenes de 25mm (ver routes/pld.js) */
    display: flex; flex-direction: column; justify-content: center;
  }
  /* height + width auto preserva la proporción real del logo (257x257,
     prácticamente cuadrado); align-self:center lo centra horizontalmente
     sin afectar el resto de la portada, que sigue alineada a la
     izquierda. Sin esto, el contenedor .portada (flex-direction:column,
     sin align-items) estira sus hijos al ancho completo por default
     (align-items:stretch) y deforma cualquier imagen en un óvalo. */
  .portada-logo { height: 90px; width: auto; align-self: center; margin: 0 auto 10mm; }
  .portada-eyebrow {
    font-size: 10pt; color: #2563eb; letter-spacing: 0.12em; text-transform: uppercase;
    font-weight: 700; margin-bottom: 5mm;
  }
  .portada-titulo { font-size: 30pt; line-height: 1.15; margin-bottom: 6mm; max-width: 140mm; }
  .portada-linea { width: 26mm; height: 3px; background: #2563eb; margin-bottom: 8mm; }
  .portada-subtitulo { font-size: 12.5pt; color: #475569; max-width: 130mm; line-height: 1.6; margin-bottom: 18mm; }
  .portada-meta {
    border-top: 1px solid #e2e8f0; padding-top: 5mm; font-size: 9.5pt; color: #94a3b8;
  }
  .portada-meta div { margin-bottom: 1mm; }
  .portada-alcance {
    margin-top: 10mm; padding: 5mm 6mm; background: #eff6ff; border: 1px solid #bfdbfe;
    border-radius: 6px; max-width: 140mm; font-size: 9.5pt; color: #1e3a8a; line-height: 1.55;
  }
  .portada-alcance strong { color: #1e3a8a; }

  /* ===== Índice ===== */
  .toc { page-break-before: always; }
  .toc-titulo { font-size: 20pt; margin-bottom: 3mm; }
  .toc-sub { font-size: 10.5pt; color: #64748b; margin-bottom: 10mm; }
  .toc-parte {
    font-size: 9pt; color: #2563eb; text-transform: uppercase; letter-spacing: 0.1em;
    font-weight: 700; margin: 7mm 0 2mm;
  }
  .toc ol { list-style: none; counter-reset: toc; margin: 0; padding: 0; }
  .toc li {
    counter-increment: toc; padding: 2mm 0; font-size: 10.5pt;
    border-bottom: 1px dotted #e2e8f0; display: flex; gap: 2mm;
  }
  .toc li::before {
    content: counter(toc) ".";
    font-weight: 700; color: #2563eb; min-width: 6mm;
  }

  /* ===== Capítulos =====
     Lección de la v1 de este manual, confirmada de nuevo al hacer QA de
     esta v2: CUALQUIER salto de página forzado (por capítulo o incluso
     solo al inicio de cada Parte) deja espacio en blanco desperdiciado
     cada vez que el contenido anterior termina antes de llenar la hoja —
     y no hay forma de saberlo de antemano al escribir el HTML a mano. La
     única estrategia robusta es dejar que TODO el contenido fluya de
     forma natural; el salto de página solo ocurre cuando el contenido
     realmente ya no cabe. La clase .parte-inicio se conserva en el HTML
     únicamente por si se necesita reactivar este comportamiento más
     adelante con paginación calculada — hoy no aplica ningún salto. */
  section.capitulo.parte-inicio { page-break-before: auto; }

  .chapter-eyebrow {
    font-size: 9pt; color: #2563eb; text-transform: uppercase; letter-spacing: 0.1em;
    font-weight: 700; margin-bottom: 2mm;
  }
  h1.chapter-title {
    font-size: 21pt; margin-bottom: 4mm; page-break-after: avoid;
  }
  .chapter-rule {
    border: none; border-top: 3px solid #2563eb; width: 22mm; margin: 0 0 8mm;
  }
  .chapter-intro { font-size: 11pt; color: #334155; }

  h2.section-title {
    font-size: 14pt; margin: 10mm 0 3.5mm; padding-bottom: 2mm;
    border-bottom: 1px solid #e2e8f0; page-break-after: avoid;
  }
  h3.subsection-title {
    font-size: 11.5pt; margin: 6mm 0 2.5mm; page-break-after: avoid;
  }
  h4.minititle {
    font-size: 10.5pt; margin: 4mm 0 1.5mm; color: #1e293b; page-break-after: avoid;
  }

  /* ===== Cajas de admonición ===== */
  .callout {
    display: flex; gap: 3mm; border-radius: 6px; padding: 4mm 5mm;
    margin: 4.5mm 0; page-break-inside: avoid; border: 1px solid;
  }
  .callout-icono {
    flex-shrink: 0; width: 6mm; height: 6mm; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 9pt; color: #fff; margin-top: 0.3mm;
  }
  .callout-etiqueta { font-weight: 700; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1mm; }
  .callout p:last-child { margin-bottom: 0; }
  .callout.nota { background: #eff6ff; border-color: #bfdbfe; }
  .callout.nota .callout-icono { background: #2563eb; }
  .callout.nota .callout-etiqueta { color: #1d4ed8; }
  .callout.consejo { background: #f0fdf4; border-color: #bbf7d0; }
  .callout.consejo .callout-icono { background: #16a34a; }
  .callout.consejo .callout-etiqueta { color: #15803d; }
  .callout.advertencia { background: #fffbeb; border-color: #fde68a; }
  .callout.advertencia .callout-icono { background: #d97706; }
  .callout.advertencia .callout-etiqueta { color: #b45309; }
  .callout.importante { background: #fef2f2; border-color: #fecaca; }
  .callout.importante .callout-icono { background: #dc2626; }
  .callout.importante .callout-etiqueta { color: #b91c1c; }

  /* ===== Tablas =====
     A propósito SIN "page-break-inside: avoid" en la tabla completa: eso
     obligaba a empujar la tabla ENTERA a la siguiente página cuando no
     cabía en lo que quedaba de la hoja, dejando el título justo arriba
     (que sí lleva page-break-after: avoid) huérfano con medio página en
     blanco debajo — visible en las tablas largas de 6-7 filas. El corte
     limpio se controla por FILA (tr, abajo) más el encabezado repetido
     (thead) — así una tabla larga puede partirse entre páginas de forma
     prolija, sin cortar nunca una fila a la mitad. */
  table.tabla {
    width: 100%; border-collapse: collapse; margin: 4mm 0 5mm; font-size: 9.5pt;
  }
  table.tabla th {
    text-align: left; font-weight: 700; color: #0f172a; padding: 2.3mm 3mm;
    border-bottom: 2px solid #cbd5e1; background: #f8fafc;
  }
  table.tabla td {
    padding: 2.3mm 3mm; border-bottom: 1px solid #e2e8f0; vertical-align: top;
  }
  table.tabla tr { page-break-inside: avoid; }
  table.tabla thead { display: table-header-group; }
  table.tabla tr:last-child td { border-bottom: none; }
  table.tabla-campos td:first-child { width: 30%; }
  table.tabla-campos td:nth-child(2) { width: 22%; color: #64748b; }

  .campo-ref { margin: 4.5mm 0; page-break-inside: avoid; }
  .campo-ref-titulo { font-weight: 700; font-size: 10pt; color: #0f172a; margin-bottom: 1.5mm; }

  /* ===== Chips de estado ===== */
  .chip { display: inline-block; padding: 0.6mm 2.6mm; border-radius: 10px; font-size: 8.3pt; font-weight: 700; color: #fff; white-space: nowrap; }
  .chip.gris { background: #64748b; }
  .chip.naranja { background: #d97706; }
  .chip.azul { background: #2563eb; }
  .chip.rojo { background: #dc2626; }
  .chip.verde { background: #16a34a; }

  /* ===== Pasos numerados ===== */
  .paso { display: flex; gap: 3.5mm; margin-bottom: 3.5mm; page-break-inside: avoid; align-items: flex-start; }
  .paso .num {
    flex-shrink: 0; width: 7mm; height: 7mm; border-radius: 50%; background: #2563eb; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9.5pt;
  }
  .paso .txt { padding-top: 0.6mm; }
  .paso .txt strong { display: block; margin-bottom: 0.5mm; }

  /* ===== Diagrama de flujo simple (estados) ===== */
  .flujo { display: flex; align-items: center; flex-wrap: wrap; gap: 0; margin: 5mm 0; page-break-inside: avoid; }
  .flujo-caja {
    border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 3mm 4mm; font-size: 9.5pt;
    font-weight: 600; color: #0f172a; background: #f8fafc; text-align: center;
  }
  .flujo-caja.exito { border-color: #86efac; background: #f0fdf4; color: #15803d; }
  .flujo-caja.error { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
  .flujo-flecha { padding: 0 2.5mm; color: #94a3b8; font-size: 12pt; }
  .flujo-nota { font-size: 9.3pt; color: #64748b; margin-top: 2mm; }

  /* ===== Figuras (capturas reales) ===== */
  .figura { margin: 5mm 0 6.5mm; page-break-inside: avoid; text-align: center; }
  .figura img {
    width: 100%; border: 1px solid #e2e8f0; border-radius: 6px;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
  }
  .figura figcaption { font-size: 8.8pt; color: #64748b; margin-top: 2.5mm; text-align: left; line-height: 1.5; }
  .figura figcaption strong { color: #334155; }

  /* ===== FAQ / preguntas ===== */
  .pregunta { margin: 5mm 0; page-break-inside: avoid; }
  .pregunta h4 { font-size: 10.8pt; color: #1d4ed8; margin-bottom: 1.5mm; }

  .footer-final { font-size: 8.5pt; color: #94a3b8; text-align: center; margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>

<!-- ===================== PORTADA ===================== -->
<div class="portada">
  ${logoSrc ? `<img class="portada-logo" src="${logoSrc}" alt="Notaría 17" />` : ''}
  <div class="portada-eyebrow">Sistema Notarial · Notaría Pública No. 17</div>
  <h1 class="portada-titulo">Manual del Módulo PLD</h1>
  <div class="portada-linea"></div>
  <p class="portada-subtitulo">
    Guía completa, paso a paso, de la Prevención de Lavado de Dinero: desde que el sistema detecta
    una obligación en una Escritura hasta que el aviso queda presentado ante el SAT.
  </p>
  <div class="portada-alcance">
    <strong>Alcance de este manual:</strong> el flujo completo del Expediente PLD — detección, captura,
    diagnóstico jurídico, generación del XML, presentación manual en el portal SPPLD y registro del
    resultado del SAT. No cubre otros módulos del sistema (Escrituras, Recibos, Protocolito, etc.).
  </div>
  <div class="portada-meta">
    <div>Versión 2.0</div>
    <div>Generado el ${fechaGenerado}</div>
    <div>Ciudad Juárez, Chihuahua</div>
  </div>
</div>

<!-- ===================== ÍNDICE ===================== -->
<div class="toc">
  <h2 class="toc-titulo">Contenido</h2>
  <p class="toc-sub">21 secciones organizadas en 5 partes.</p>

  <div class="toc-parte">Parte 1 — Introducción</div>
  <ol>
    <li>Bienvenida al módulo PLD</li>
    <li>Antes de empezar: conceptos clave</li>
  </ol>

  <div class="toc-parte">Parte 2 — Detección y control</div>
  <ol start="3">
    <li>Cómo entrar al módulo</li>
    <li>Panel de Control PLD</li>
    <li>Detección Automática</li>
  </ol>

  <div class="toc-parte">Parte 3 — El Expediente PLD, paso a paso</div>
  <ol start="6">
    <li>Conoce el expediente: la pantalla de trabajo</li>
    <li>Paso 1 — Dashboard del expediente</li>
    <li>Paso 2 — Datos generales (comparecientes)</li>
    <li>Paso 3 — Actividad</li>
    <li>Paso 4 — Validaciones</li>
    <li>Paso 5 — Generar el XML</li>
    <li>Paso 6 — Acuse del SAT</li>
    <li>Paso 7 — Historial y auditoría</li>
  </ol>

  <div class="toc-parte">Parte 4 — Inteligencia y control</div>
  <ol start="14">
    <li>Diagnóstico Jurídico Inteligente</li>
    <li>Ciclo de vida completo de un aviso</li>
    <li>Roles y permisos</li>
  </ol>

  <div class="toc-parte">Parte 5 — Referencia rápida</div>
  <ol start="17">
    <li>Flujo recomendado, de principio a fin</li>
    <li>Buenas prácticas y recomendaciones</li>
    <li>Errores comunes y cómo resolverlos</li>
    <li>Preguntas frecuentes</li>
    <li>Glosario</li>
  </ol>
</div>

<!-- ===================== 1. BIENVENIDA ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 1 · Introducción</div>
  <h1 class="chapter-title">1. Bienvenida al módulo PLD</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Este módulo existe para que la Notaría cumpla, sin esfuerzo manual innecesario, con la
    <strong>LFPIORPI</strong> — la Ley Federal para la Prevención e Identificación de Operaciones con
    Recursos de Procedencia Ilícita. En términos simples: cuando un notario autoriza ciertos actos
    (poderes irrevocables, donaciones, compraventas, fideicomisos, mutuos, etc.), la ley obliga a dar
    aviso a la <strong>UIF</strong> (Unidad de Inteligencia Financiera) a través del <strong>SAT</strong>.
    El módulo PLD detecta esos casos, ayuda a construir el expediente correcto y genera el archivo que
    se necesita para presentar el aviso.
  </p>

  ${callout('importante', `
    <p>
      Este sistema <strong>nunca envía nada al SAT de forma automática</strong>. El SAT no ofrece una
      conexión directa (API) para el portal SPPLD, así que subir el archivo y firmarlo con
      <strong>e.firma</strong> siempre lo hace una persona, manualmente, en el sitio del SAT — fuera de
      este sistema. El módulo se encarga de todo el trabajo previo (detectar, documentar, generar el
      archivo correcto y llevar el registro) para que ese último paso manual sea rápido y sin errores.
    </p>
  `)}

  <h2 class="section-title">¿Qué hace el módulo por ti, en concreto?</h2>
  <ul class="normal">
    <li><strong>Detecta automáticamente</strong> qué Escrituras generan obligación de aviso, sin que nadie tenga que revisarlas una por una.</li>
    <li><strong>Te dice por qué</strong> aplica la obligación — con el fundamento legal exacto, no una alerta genérica.</li>
    <li><strong>Te guía</strong> sobre qué datos faltan para poder generar el aviso, con un checklist claro.</li>
    <li><strong>Genera el archivo XML</strong> oficial que exige el esquema del SPPLD, con el formato correcto.</li>
    <li><strong>Lleva el registro</strong> de cada acuse, cada rechazo y cada cambio, de forma permanente e inalterable.</li>
  </ul>

  <h2 class="section-title">¿Quién debería leer este manual?</h2>
  <p>
    Cualquier persona que vaya a trabajar con expedientes PLD dentro del sistema: notarios, abogados
    responsables de escrituras, y el personal de apoyo que captura información. No se necesita
    experiencia técnica ni conocimiento previo del sistema — cada pantalla, cada botón y cada mensaje
    que puedes encontrar están explicados aquí con ejemplos reales.
  </p>

  ${callout('consejo', `
    <p>
      Si es tu primera vez usando el módulo, lee las Partes 1 a 3 en orden antes de abrir tu primer
      expediente real. La Parte 5 (buenas prácticas, errores comunes, preguntas frecuentes) es más útil
      como referencia rápida una vez que ya conoces el flujo.
    </p>
  `)}
</section>

<!-- ===================== 2. CONCEPTOS CLAVE ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 1 · Introducción</div>
  <h1 class="chapter-title">2. Antes de empezar: conceptos clave</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Cuatro ideas que se repiten en todo el manual. Entenderlas de una vez evita confusiones después.
  </p>

  <h2 class="section-title">El Aviso PLD</h2>
  <p>
    Cada operación sujeta a PLD genera un registro llamado <strong>Aviso PLD</strong>, ligado a la
    Escritura que le dio origen. Un Aviso PLD guarda todo: el fundamento legal de por qué aplica, los
    comparecientes, los datos de la actividad, el XML generado (con historial de versiones), el acuse
    del SAT una vez presentado, y un historial de auditoría permanente. Cuando este manual dice
    «expediente», se refiere exactamente a un Aviso PLD abierto en pantalla.
  </p>

  <h2 class="section-title">El Motor de Reglas</h2>
  <p>
    Es el componente que analiza una Escritura y decide, con fundamento legal explícito, si genera
    obligación PLD, qué documentos exige la regla aplicable y qué advertencias jurídicas corresponden.
    Aparece en dos lugares: en <strong>Detección Automática</strong> (capítulo 5), evaluando todas las
    Escrituras del sistema, y en el <strong>Diagnóstico Jurídico</strong> (capítulo 14) de cada
    expediente en particular.
  </p>

  <h2 class="section-title">Dos tipos de progreso, que no son lo mismo</h2>
  <p>
    El sistema distingue todo el tiempo entre dos preguntas distintas, y las muestra por separado para
    no confundirlas:
  </p>
  <table class="tabla">
    <thead><tr><th>Pregunta</th><th>Quién la responde</th><th>Dónde se ve</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>¿Aplica la ley aquí, y por qué?</strong></td>
        <td>El Motor de Reglas, a partir de la Escritura. Es información legal — estable una vez detectada.</td>
        <td>Diagnóstico Jurídico, bloques «Veredicto» y «Fundamento».</td>
      </tr>
      <tr>
        <td><strong>¿Ya capturé lo necesario para generar el XML?</strong></td>
        <td>El propio expediente, a partir de lo que se ha guardado. Es información operativa — cambia con cada guardado.</td>
        <td>Sidebar, Dashboard del expediente, pantalla Validaciones.</td>
      </tr>
    </tbody>
  </table>

  <h2 class="section-title">Roles: quién puede hacer qué</h2>
  <p>
    El sistema nunca muestra un botón de una acción que tu rol no tiene permitida. El capítulo 16
    (Roles y permisos) detalla la tabla completa; por ahora basta con saber que hay cuatro niveles:
    <strong>Administrador</strong> y <strong>Notario</strong> pueden generar XML y presentar avisos;
    <strong>Capturista</strong> puede capturar datos pero no generar/presentar; <strong>Consulta</strong>
    no tiene acceso al módulo.
  </p>
</section>

<!-- ===================== 3. CÓMO ENTRAR ===================== -->
<section class="capitulo parte-inicio">
  <div class="chapter-eyebrow">Parte 2 · Detección y control</div>
  <h1 class="chapter-title">3. Cómo entrar al módulo</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">Tres clics desde cualquier pantalla del sistema:</p>

  <div class="paso"><div class="num">1</div><div class="txt"><strong>Abre el submenú «Escrituras»</strong> en el menú lateral izquierdo.</div></div>
  <div class="paso"><div class="num">2</div><div class="txt"><strong>Haz clic en «Expedientes PLD»</strong>, justo debajo de «Escrituras».</div></div>
  <div class="paso"><div class="num">3</div><div class="txt">La sección se abre en la pestaña <strong>Panel de Control</strong> por defecto, con <strong>Detección Automática</strong> como segunda pestaña.</div></div>

  ${figura('01-menu-navegacion.jpg', 1, 'Cómo llegar al módulo: menú lateral → Escrituras → Expedientes PLD.')}

  ${callout('nota', `
    <p>
      Hoy la sección «Expedientes PLD» del menú solo la ve el rol <strong>Administrador</strong> del
      sistema. Dentro del módulo, cada pantalla además respeta los permisos PLD descritos en el
      capítulo 16 — un notario con permiso PLD puede trabajar sus propios expedientes aunque no vea
      esta entrada de menú, entrando desde la columna PLD de Escrituras (ver nota abajo).
    </p>
  `)}

  <h2 class="section-title">Una segunda forma de llegar: desde una Escritura</h2>
  <p>
    También se puede abrir un expediente puntual desde la columna <strong>PLD</strong> del listado de
    Escrituras: cada fila con obligación PLD muestra un botón con el estado del aviso («Evaluar PLD»,
    «XML generado», «Presentado», etc.) que abre exactamente el mismo Expediente PLD que se explica en
    la Parte 3 de este manual — es la misma pantalla, solo cambia la puerta de entrada.
  </p>
</section>

<!-- ===================== 4. PANEL DE CONTROL ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 2 · Detección y control</div>
  <h1 class="chapter-title">4. Panel de Control PLD</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Es tu vista operativa del día a día: un tablero para monitorear todos los Avisos PLD que ya
    existen, con métricas, filtros, búsqueda, orden y acciones rápidas. A diferencia de Detección
    Automática (capítulo 5), el Panel de Control solo muestra avisos que <strong>ya tienen
    expediente abierto</strong>.
  </p>

  ${figura('02-panel-control.jpg', 2, 'Panel de Control PLD: tarjetas de métricas, filtros y la tabla de avisos.')}

  <h2 class="section-title">4.1 Las siete tarjetas de métricas</h2>
  <p>En la parte superior, siete tarjetas con conteos en tiempo real:</p>
  <table class="tabla">
    <thead><tr><th>Tarjeta</th><th>Qué cuenta</th></tr></thead>
    <tbody>
      <tr><td><strong>Total de avisos</strong></td><td>Todos los Avisos PLD que cumplen los filtros activos en ese momento.</td></tr>
      <tr><td><strong>Pendientes</strong></td><td>Avisos en estado Pendiente, Pendiente (DeclaraNot) o Listo — todavía no llegan a generar XML.</td></tr>
      <tr><td><strong>XML generados</strong></td><td>Avisos actualmente en estado «XML generado» — listos para subir al SPPLD.</td></tr>
      <tr><td><strong>Presentados</strong></td><td>Avisos ya presentados ante el SAT, con acuse registrado.</td></tr>
      <tr><td><strong>Rechazados</strong></td><td>Avisos que el SAT rechazó al subir el XML.</td></tr>
      <tr><td><strong>Acuses registrados</strong></td><td>Avisos que ya tienen un PDF de acuse guardado en el sistema.</td></tr>
      <tr><td><strong>Vencidos</strong></td><td>Avisos cuya fecha límite ya pasó y que todavía no están Presentados, Cancelados o marcados como No aplica.</td></tr>
    </tbody>
  </table>

  <h3 class="subsection-title">Las tarjetas también son un atajo de filtro</h3>
  <p>
    Las cuatro tarjetas de estado (Pendientes, XML generados, Presentados, Rechazados) funcionan como
    botones: un clic filtra la tabla por ese estado exacto; un segundo clic sobre la misma tarjeta lo
    quita. Cuando un filtro está activo, la tarjeta se ve con el borde resaltado del color de su icono.
  </p>

  ${figura('04-tarjeta-activa.jpg', 3, 'Un clic sobre una tarjeta de métrica (aquí, «Pendientes») la usa como atajo de filtro. El borde de color resaltado indica que está activa.')}

  ${callout('nota', `
    <p>
      Las tarjetas <strong>ignoran el filtro de Estado</strong> de la tabla a propósito (aunque sí
      respetan los demás filtros, como fechas o tipo de acto): así siempre muestran el desglose
      completo por estado, sin importar qué estado tengas filtrado en la tabla en ese momento.
    </p>
  `)}

  <h2 class="section-title">4.2 Filtros y búsqueda</h2>
  <table class="tabla">
    <thead><tr><th>Campo</th><th>Qué hace</th></tr></thead>
    <tbody>
      <tr><td><strong>Búsqueda instantánea</strong></td><td>Busca por número de control, tipo de acto, abogado responsable o folio del SAT, con resultados casi en tiempo real (una pequeña pausa mientras dejas de escribir).</td></tr>
      <tr><td><strong>Estado</strong></td><td>Filtra por el estado exacto del aviso — ver la Figura 4 para las ocho opciones disponibles.</td></tr>
      <tr><td><strong>Desde / Hasta</strong></td><td>Rango de fechas sobre la fecha de operación de la escritura.</td></tr>
      <tr><td><strong>Tipo de acto</strong></td><td>Texto libre contra la actividad detectada (por ejemplo, escribir «poder» encuentra todos los otorgamientos de poder).</td></tr>
      <tr><td><strong>Núm. de escritura</strong></td><td>Número de control exacto.</td></tr>
      <tr><td><strong>Compareciente</strong></td><td>Busca por nombre de cualquier compareciente ya capturado en el expediente.</td></tr>
      <tr><td><strong>Abogado responsable</strong></td><td>Solo visible para roles que pueden ver todos los expedientes (Administrador); el resto de roles ya está limitado a sus propios avisos, así que este campo no les sirve de nada y por eso no se les muestra.</td></tr>
    </tbody>
  </table>

  ${figura('03-filtro-estado.jpg', 4, 'El filtro Estado despliega los ocho estados posibles de un aviso: Todos, Pendiente, Pendiente (DeclaraNot), Listo, XML generado, Presentado, Rechazado SPPLD, No aplica y Cancelado.')}

  <p>El botón <strong>Limpiar</strong>, junto a los filtros, borra todos de un solo clic.</p>

  <h2 class="section-title">4.3 La tabla de avisos</h2>
  <p>
    Columnas: Número de control, Tipo de acto, Compareciente(s), Responsable, Estado, Fecha de
    operación, Fecha límite (en rojo si ya venció, en verde si falta tiempo) y Acciones. Se puede
    ordenar haciendo clic en cualquier encabezado de columna, y la tabla pagina del lado del servidor —
    el número de filas por página se ajusta en la parte inferior.
  </p>

  <h2 class="section-title">4.4 Acciones rápidas por fila</h2>
  <p>
    Cada fila tiene un ícono de ojo (abre el expediente completo, Parte 3 de este manual) y un menú de
    tres puntos con acciones que cambian según el estado del aviso — nunca se muestra una acción que el
    sistema fuera a rechazar.
  </p>

  ${figura('05-menu-acciones-basico.jpg', 5, 'Menú de acciones de una fila en estado Pendiente: solo «Generar XML» y «Ver historial» tienen sentido en este punto del ciclo de vida.')}

  ${figura('06-menu-acciones-completo.jpg', 6, 'En un aviso ya Presentado, con XML y acuse guardados, el menú ofrece «Descargar XML», «Descargar acuse» y «Ver historial».')}

  <table class="tabla">
    <thead><tr><th>Acción</th><th>Cuándo aparece</th></tr></thead>
    <tbody>
      <tr><td>Generar / Regenerar XML</td><td>Estado Pendiente, Listo o XML generado, y el usuario tiene permiso para presentar avisos.</td></tr>
      <tr><td>Descargar XML</td><td>El aviso ya tiene al menos una versión de XML generada.</td></tr>
      <tr><td>Registrar acuse</td><td>Estado «XML generado» — abre el expediente directo en la pantalla de Acuse.</td></tr>
      <tr><td>Descargar acuse</td><td>Estado Presentado, con el PDF del acuse ya guardado.</td></tr>
      <tr><td>Ver historial</td><td>Siempre disponible — abre el expediente directo en la pantalla de Historial.</td></tr>
      <tr><td>Reintentar</td><td>Aparece siempre <strong>deshabilitada</strong> en un aviso Rechazado — ver capítulo 19, «Errores comunes».</td></tr>
    </tbody>
  </table>
</section>

<!-- ===================== 5. DETECCIÓN AUTOMÁTICA ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 2 · Detección y control</div>
  <h1 class="chapter-title">5. Detección Automática</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Esta pestaña responde una pregunta distinta a la del Panel de Control: <strong>de todas las
    Escrituras del sistema, ¿cuáles están sujetas a PLD?</strong> — incluyendo las que todavía no
    tienen expediente abierto. La fuente de esta lista es el Motor de Reglas (capítulo 2), que evalúa
    cada Escritura contra las reglas jurídicas vigentes sin necesidad de que exista todavía un Aviso PLD.
  </p>

  ${figura('07-deteccion-automatica.jpg', 7, 'Detección Automática: todas las Escrituras que el Motor de Reglas identificó sujetas a PLD, con un resumen arriba de la tabla.')}

  <h2 class="section-title">Los estados que puedes ver aquí</h2>
  <ul class="normal">
    <li><span class="chip gris">Pendiente de iniciar</span> — el motor detectó que aplica PLD, pero nadie ha abierto el expediente todavía.</li>
    <li><span class="chip naranja">Requiere revisión</span> — el motor no pudo decidir solo (falta un dato, o el tipo de trámite no se reconoce con certeza) y necesita que una persona lo revise.</li>
    <li>Cualquier estado real de Aviso PLD (Pendiente, Listo, XML generado, etc.), si el expediente ya se abrió — en ese caso el aviso ya existente manda: no se vuelve a evaluar con el motor aunque la regla vigente haya cambiado desde entonces.</li>
  </ul>

  ${figura('08-requiere-revision.jpg', 8, 'Un caso «Requiere revisión manual»: el motor no pudo determinar el tipo de trámite y lo marca para revisión humana. El Diagnóstico Jurídico, a la derecha, refleja el mismo veredicto con Riesgo alto.')}

  <p>
    Al hacer clic en cualquier fila se abre el Expediente PLD correspondiente; si todavía no existe un
    Aviso PLD, el sistema lo crea en ese momento — <strong>nunca antes</strong>, solo por mirar la
    lista.
  </p>

  ${callout('nota', `
    <p>
      Arriba de la tabla aparece un resumen de una línea: cuántas escrituras se evaluaron en total,
      cuántas están pendientes de iniciar, cuántas requieren revisión y cuántas ya tienen expediente
      abierto.
    </p>
  `)}

  <div class="pregunta">
    <h4>¿Por qué una escritura dice «Requiere revisión» en vez de simplemente marcar el tipo de trámite?</h4>
    <p>
      Porque el motor prefiere pedir revisión humana antes que adivinar. Si el tipo de trámite de la
      Escritura no se puede identificar con certeza, o falta un dato indispensable para decidir, el
      sistema nunca inventa una respuesta — te lo marca explícitamente en naranja para que lo revises.
    </p>
  </div>
</section>

<!-- ===================== 6. CONOCE EL EXPEDIENTE ===================== -->
<section class="capitulo parte-inicio">
  <div class="chapter-eyebrow">Parte 3 · El Expediente PLD, paso a paso</div>
  <h1 class="chapter-title">6. Conoce el expediente: la pantalla de trabajo</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Al abrir un aviso (desde cualquiera de las dos pestañas anteriores, o desde la columna PLD de
    Escrituras) se despliega el Expediente PLD completo, siempre con la misma estructura de tres
    columnas, sin importar en qué pantalla estés trabajando.
  </p>

  ${figura('09-expediente-dashboard.jpg', 9, 'El Expediente PLD completo: Sidebar de estado (izquierda), contenido del paso activo (centro) y Diagnóstico Jurídico (derecha).')}

  <h2 class="section-title">Columna izquierda: el Sidebar (siempre visible)</h2>
  <p>
    Es un resumen fijo del expediente que no cambia aunque navegues entre pantallas — así nunca pierdes
    de vista lo esencial mientras trabajas en otra cosa.
  </p>
  <table class="tabla">
    <thead><tr><th>Bloque</th><th>Qué muestra</th></tr></thead>
    <tbody>
      <tr><td><strong>Estado</strong></td><td>El chip de color con el estado actual, y una barra de progreso del 0 al 100% sobre el ciclo de vida del aviso.</td></tr>
      <tr><td><strong>Checklist</strong></td><td>Hasta 4 puntos pendientes más urgentes (si hay más, indica cuántos más hay), o «Todo completo» si no falta nada.</td></tr>
      <tr><td><strong>Acciones rápidas</strong></td><td>Botones «Datos generales» y «Ver validaciones»; si ya existe un XML generado, también «Descargar XML».</td></tr>
      <tr><td><strong>Alertas</strong></td><td>Avisos importantes en una frase: datos pendientes, si la detección automática requiere revisión, o si el aviso está por vencer o ya venció.</td></tr>
      <tr><td><strong>Responsable</strong></td><td>El abogado a cargo del expediente, o «Pendiente» si todavía no se ha asignado.</td></tr>
      <tr><td><strong>Última actualización</strong></td><td>Fecha y hora del último cambio guardado.</td></tr>
    </tbody>
  </table>

  <h2 class="section-title">Columna central: el indicador de 7 pasos</h2>
  <p>
    Justo arriba del contenido aparece un indicador de progreso con 7 círculos numerados —
    <strong>Dashboard, Datos generales, Actividad, Validaciones, XML, Acuse, Historial</strong> — cada
    uno con su nombre debajo. Cada capítulo de esta Parte 3 explica uno de estos pasos en detalle.
  </p>
  ${callout('consejo', `
    <p>
      Puedes hacer clic en cualquier círculo para saltar directo a ese paso: <strong>no es un asistente
      que obligue a avanzar en orden</strong>. Un círculo se marca como completo (✓) cuando ese paso ya
      no tiene pendientes según los datos guardados — no según lo que tengas escrito sin guardar en
      pantalla.
    </p>
  `)}

  <h2 class="section-title">Columna derecha: Diagnóstico Jurídico</h2>
  <p>
    El panel de Inteligencia Jurídica, visible en las 7 pantallas sin importar cuál esté activa. Se
    explica a fondo en el capítulo 14 — por ahora basta con saber que te dice, en todo momento, si esta
    escritura genera obligación PLD, por qué, y qué tan urgente es atenderla.
  </p>
</section>

<!-- ===================== 7. PASO 1 — DASHBOARD ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 3 · El Expediente PLD, paso a paso</div>
  <h1 class="chapter-title">7. Paso 1 — Dashboard del expediente</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Es la vista de solo lectura a la que vuelves constantemente: qué está pasando con este expediente,
    qué falta y qué sigue. No se captura nada aquí — para eso están los pasos 2 y 3.
  </p>

  <h2 class="section-title">Qué encuentras en esta pantalla</h2>
  <table class="tabla">
    <thead><tr><th>Sección</th><th>Contenido</th></tr></thead>
    <tbody>
      <tr><td><strong>Estado y progreso</strong></td><td>El mismo chip y barra de progreso del Sidebar, más el fundamento legal resumido (por ejemplo, «Otorgamiento de poder irrevocable (b)»).</td></tr>
      <tr><td><strong>Próxima acción recomendada</strong></td><td>Una frase concreta de qué hacer, con un botón «Ir» directo a la pantalla correspondiente.</td></tr>
      <tr><td><strong>Información de la escritura</strong></td><td>Número de control, tipo de trámite, fecha de operación, monto, cuántos comparecientes hay capturados y el responsable.</td></tr>
      <tr><td><strong>Checklist del expediente</strong></td><td>La lista completa de pendientes (no solo los primeros 4 como en el Sidebar).</td></tr>
      <tr><td><strong>Acciones disponibles</strong></td><td>Botones directos a Datos generales, Actividad, Validaciones y, si el estado lo permite, XML.</td></tr>
    </tbody>
  </table>

  <h3 class="subsection-title">Qué dice la «Próxima acción recomendada» según el estado</h3>
  <table class="tabla">
    <thead><tr><th>Estado del aviso</th><th>Recomendación</th></tr></thead>
    <tbody>
      <tr><td>No aplica</td><td>«Esta escritura no genera obligación PLD. No se requiere ninguna acción.»</td></tr>
      <tr><td>Cancelado</td><td>«Expediente cancelado» (con el motivo, si se registró uno).</td></tr>
      <tr><td>Presentado</td><td>«Aviso presentado ante el SAT. No se requiere ninguna acción adicional.»</td></tr>
      <tr><td>Rechazado SPPLD</td><td>«El SAT rechazó el aviso. Corrige los datos y genera un nuevo XML.»</td></tr>
      <tr><td>XML generado</td><td>«Descarga el XML, súbelo al portal SPPLD y registra el acuse.»</td></tr>
      <tr><td>Listo</td><td>«Los datos están completos. Genera el XML para continuar.»</td></tr>
      <tr><td>Pendiente, con datos incompletos</td><td>«Completa los datos generales y de la actividad para poder generar el XML.»</td></tr>
      <tr><td>Pendiente, con datos completos</td><td>«Los datos están completos. Revisa las validaciones antes de continuar.»</td></tr>
    </tbody>
  </table>
</section>

<!-- ===================== 8. PASO 2 — DATOS GENERALES ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 3 · El Expediente PLD, paso a paso</div>
  <h1 class="chapter-title">8. Paso 2 — Datos generales (comparecientes)</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Aquí se capturan las personas que intervienen en el acto. Qué roles necesitas depende del tipo de
    actividad detectada — el sistema te muestra chips con cada rol requerido, en verde si ya está
    cubierto o en naranja si todavía falta.
  </p>
  <table class="tabla">
    <thead><tr><th>Tipo de acto</th><th>Roles requeridos</th></tr></thead>
    <tbody>
      <tr><td>Otorgamiento de poder</td><td><strong>Poderdante</strong> y <strong>Apoderado</strong></td></tr>
      <tr><td>Cesión de derechos de fideicomiso</td><td><strong>Cedente</strong> y <strong>Cesionario</strong></td></tr>
      <tr><td>Mutuo o crédito</td><td><strong>Acreedor</strong> y <strong>Deudor</strong></td></tr>
    </tbody>
  </table>

  ${figura('10-datos-generales.jpg', 10, 'Datos generales con dos comparecientes ya capturados y guardados: un Apoderado y un Poderdante, cada uno con su chip de rol en verde.')}

  <h2 class="section-title">Campos de cada compareciente</h2>
  <table class="tabla">
    <thead><tr><th>Campo</th><th>Aplica a</th><th>Detalle</th></tr></thead>
    <tbody>
      <tr><td><strong>Tipo de persona</strong></td><td>Todos</td><td>Física o Moral — cambia qué campos aparecen debajo.</td></tr>
      <tr><td><strong>Rol *</strong></td><td>Todos</td><td>El papel que juega en la operación (Poderdante, Apoderado, etc.). Obligatorio.</td></tr>
      <tr><td><strong>Nacionalidad *</strong></td><td>Todos</td><td>Catálogo oficial de países (ISO 3166-1). Obligatorio.</td></tr>
      <tr><td><strong>Nombre, Apellido paterno, Apellido materno *</strong></td><td>Persona física</td><td>Obligatorios.</td></tr>
      <tr><td><strong>Denominación o razón social *</strong></td><td>Persona moral</td><td>Obligatorio.</td></tr>
      <tr><td><strong>Actividad económica</strong> / <strong>Giro mercantil</strong> (7 dígitos)</td><td>Física / Moral</td><td>Código SAT de 7 dígitos. Obligatorio solo para roles «no simples» — ver nota abajo.</td></tr>
      <tr><td><strong>Fecha de nacimiento</strong></td><td>Persona física</td><td>Formato DD/MM/AAAA. No es obligatoria.</td></tr>
      <tr><td><strong>RFC</strong></td><td>Todos</td><td>No es obligatorio, pero si lo capturas, se valida el formato en tiempo real (ver abajo).</td></tr>
      <tr><td><strong>CURP</strong></td><td>Persona física</td><td>No es obligatoria, pero si la capturas, se valida el formato en tiempo real.</td></tr>
    </tbody>
  </table>

  ${callout('nota', `
    <p>
      «Rol simple» es una distinción técnica del sistema: para roles como <strong>Apoderado</strong>
      (a diferencia de Poderdante), no se exige capturar la actividad económica ni el giro mercantil,
      porque el esquema oficial del SPPLD no lo requiere para ese rol específico. Si no ves el asterisco
      de obligatorio en ese campo, es justamente por eso — no es un descuido de la pantalla.
    </p>
  `)}

  <h3 class="subsection-title">Formato de RFC y CURP, con ejemplos</h3>
  <table class="tabla">
    <thead><tr><th>Campo</th><th>Patrón</th><th>Ejemplo válido</th></tr></thead>
    <tbody>
      <tr><td>RFC persona física</td><td>4 letras + 6 dígitos de fecha (AAMMDD) + 3 caracteres</td><td><code>GOMJ800101AB1</code></td></tr>
      <tr><td>RFC persona moral</td><td>3 letras + 6 dígitos de fecha (AAMMDD) + 3 caracteres</td><td><code>ABC800101AB1</code></td></tr>
      <tr><td>CURP</td><td>4 letras + 6 dígitos de fecha + sexo (H o M) + 5 letras + 2 caracteres</td><td><code>GOMJ800101HDFRZN01</code></td></tr>
    </tbody>
  </table>
  <p>
    Si el formato no coincide, el campo se marca en rojo con el mensaje exacto («Formato no coincide
    con RFC físico», «Formato de CURP no válido») — corrígelo directamente ahí, no hace falta borrar
    todo el compareciente.
  </p>

  <h2 class="section-title">Validación en tiempo real</h2>
  <p>
    Al agregar un compareciente nuevo con el botón <strong>+ Agregar compareciente</strong>, los campos
    obligatorios aparecen marcados en rojo con la palabra «Requerido» debajo, incluso antes de que
    intentes guardar — es una guía visual inmediata, no un error.
  </p>

  ${figura('11-datos-generales-validacion.jpg', 11, 'Validación en tiempo real: al agregar un compareciente nuevo, los campos obligatorios se marcan en rojo hasta que se completan. El mensaje «Selecciona un rol para saber qué campos son obligatorios» aparece cuando el Rol todavía no se ha elegido.')}

  ${callout('advertencia', `
    <p>
      Mientras el compareciente nuevo no tenga un <strong>Rol</strong> seleccionado, el sistema no
      puede saber qué más es obligatorio para él (por ejemplo, si le aplica la excepción de «rol
      simple») — por eso ese mensaje aparece primero. Selecciona el Rol antes que cualquier otro campo.
    </p>
  `)}

  <h2 class="section-title">Guardar</h2>
  <p>
    El botón <strong>Guardar cambios</strong>, arriba a la derecha, actualiza el aviso de inmediato —
    no hace falta pasar a otra pantalla. Al guardar correctamente aparece un mensaje verde
    «Comparecientes guardados»; si algo falla, aparece en rojo con el motivo exacto que regresó el
    servidor.
  </p>
  <p>
    El botón <strong>Quitar compareciente</strong>, debajo de cada tarjeta, elimina esa persona del
    borrador — el cambio no es definitivo hasta que aprietas «Guardar cambios».
  </p>
</section>

<!-- ===================== 9. PASO 3 — ACTIVIDAD ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 3 · El Expediente PLD, paso a paso</div>
  <h1 class="chapter-title">9. Paso 3 — Actividad</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Datos específicos del tipo de acto que no caben ni en «comparecientes» ni en «monto». Los campos
    que ves aquí cambian según el tipo de actividad detectada — el sistema solo muestra los que
    corresponden, nunca todos los campos posibles de todos los tipos.
  </p>

  <table class="tabla">
    <thead><tr><th>Tipo de acto</th><th>Campos específicos</th></tr></thead>
    <tbody>
      <tr><td>Otorgamiento de poder</td><td>Tipo de poder (catálogo oficial)</td></tr>
      <tr>
        <td>Cesión de derechos de fideicomiso</td>
        <td>Denominación del fideicomiso, identificador del fideicomiso (opcional), RFC del fideicomiso (opcional), tipo de cesión (catálogo oficial), monto de la cesión</td>
      </tr>
      <tr><td>Mutuo o crédito</td><td>Tipo de otorgamiento (catálogo oficial), moneda (catálogo oficial)</td></tr>
    </tbody>
  </table>
  <p>
    En <strong>todos</strong> los tipos de acto se captura además el <strong>Tipo de alerta (UIF)</strong>
    — es obligatorio sin excepción, sin importar qué actividad sea.
  </p>

  ${figura('12-actividad.jpg', 12, 'Actividad, con los catálogos oficiales «Tipo de poder» y «Tipo de alerta (UIF)» todavía pendientes de cargar. El chip superior indica cuántos de los campos requeridos ya están completos.')}

  ${callout('advertencia', `
    <p>
      Los catálogos oficiales de la UIF/SAT (tipo de poder, tipo de cesión, tipo de otorgamiento,
      moneda, tipo de alerta) están preparados técnicamente en el sistema, pero
      <strong>pendientes de cargar con los valores oficiales</strong> publicados por la autoridad.
      Mientras un catálogo esté vacío, el campo correspondiente aparece deshabilitado con el mensaje
      «Catálogo oficial "…" pendiente de cargar — sin opciones disponibles todavía» — el sistema
      <strong>nunca inventa</strong> valores de catálogo para desbloquear la pantalla.
    </p>
  `)}

  <div class="pregunta">
    <h4>¿Puedo escribir el valor manualmente si sé cuál es la clave del catálogo?</h4>
    <p>
      No. Los campos de catálogo son siempre un menú desplegable, nunca texto libre — es intencional,
      para que jamás se capture una clave que no exista realmente en el catálogo oficial vigente. Si
      necesitas ese catálogo cargado, contacta al administrador del sistema.
    </p>
  </div>

  <p>
    El botón <strong>Guardar cambios</strong> funciona igual que en Datos generales: guarda de
    inmediato y muestra un mensaje de confirmación o de error.
  </p>
</section>

<!-- ===================== 10. PASO 4 — VALIDACIONES ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 3 · El Expediente PLD, paso a paso</div>
  <h1 class="chapter-title">10. Paso 4 — Validaciones</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Un checklist inteligente, no una lista plana de errores: agrupa todo lo que exige el expediente por
    categoría real (Comparecientes, Datos Generales, Actividad), mostrando tanto lo ya cumplido (✓
    verde) como lo pendiente, en lenguaje natural.
  </p>

  ${figura('13-validaciones.jpg', 13, 'Validaciones agrupa el checklist en categorías. Arriba, dos avisos claros de una sola línea indican exactamente qué falta para «Generar XML» y qué falta para «Enviar al SAT».')}

  <h2 class="section-title">Los dos avisos de arriba</h2>
  <p>
    Antes del checklist detallado, dos recuadros responden directamente las dos preguntas que más
    importan en este punto:
  </p>
  <table class="tabla">
    <thead><tr><th>Recuadro</th><th>Ejemplos de mensaje</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>Generar XML</strong></td>
        <td>
          «Completa los puntos marcados abajo antes de poder generar el XML.» ·
          «Ya puedes generar el XML — no falta ningún dato.» ·
          «Esta escritura no genera obligación PLD — no aplica generar XML.»
        </td>
      </tr>
      <tr>
        <td><strong>Enviar al SAT</strong></td>
        <td>
          «Primero debes generar el XML antes de poder subirlo al portal del SAT.» ·
          «El XML ya está listo: descárgalo y súbelo manualmente al portal SPPLD; luego registra el acuse.»
        </td>
      </tr>
    </tbody>
  </table>

  <h2 class="section-title">Cómo leer cada línea del checklist</h2>
  <table class="tabla">
    <thead><tr><th>Ícono</th><th>Significado</th></tr></thead>
    <tbody>
      <tr><td>✓ verde</td><td>Requisito cumplido — no requiere ninguna acción.</td></tr>
      <tr><td>Ⓧ rojo, etiqueta «Obligatorio»</td><td>Falta un dato indispensable — haz clic en la línea para ir directo a la pantalla donde se captura.</td></tr>
      <tr><td>▲ ámbar, etiqueta «Bloqueado»</td><td>El dato está capturado, pero depende de un catálogo oficial que todavía no se cargó (ver capítulo 9).</td></tr>
      <tr><td>ⓘ azul, etiqueta «Información»</td><td>El tipo de actividad todavía no tiene generador de XML implementado — no hay nada que capturar por ahora.</td></tr>
    </tbody>
  </table>

  ${callout('consejo', `
    <p>
      Cada línea pendiente es un botón: haz clic directamente sobre el texto y el sistema te lleva a la
      pantalla exacta donde se corrige, sin tener que adivinar si es Datos generales o Actividad.
    </p>
  `)}
</section>

<!-- ===================== 11. PASO 5 — GENERAR EL XML ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 3 · El Expediente PLD, paso a paso</div>
  <h1 class="chapter-title">11. Paso 5 — Generar el XML</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Genera el archivo XML conforme al esquema oficial <code>fep.xsd</code> del SPPLD — el formato
    exacto que el portal del SAT espera recibir.
  </p>

  ${figura('14-xml.jpg', 14, 'Mientras falten datos, la pantalla XML explica qué falta (botón «Ver qué falta») y aclara, en un recuadro azul, que el XML nunca se envía solo al SAT.')}

  <h2 class="section-title">El botón «Generar XML»</h2>
  <p>
    Solo se habilita cuando no falta ningún dato obligatorio (mismo criterio que la pantalla
    Validaciones). Si en cambio el backend encuentra un problema de formato que la pantalla no alcanzó
    a detectar — por ejemplo, un RFC con un patrón sutil inválido, una fecha mal formada o una
    nacionalidad sin código ISO reconocido — la generación se detiene y el sistema muestra la lista
    exacta de problemas encontrados, sin inventar una corrección automática.
  </p>

  ${callout('importante', `
    <p>
      Generar el XML <strong>nunca lo envía al SAT</strong>. El siguiente paso — subirlo al portal
      SPPLD y firmarlo con e.firma — sigue siendo manual, fuera del sistema. El recuadro azul de esta
      pantalla lo recuerda cada vez.
    </p>
  `)}

  <h2 class="section-title">Versiones y descarga</h2>
  <p>
    Cada vez que generas (o regeneras) el XML, el sistema lo numera como una nueva versión, guardando
    quién la generó y cuándo — nada se sobrescribe en silencio. El botón <strong>Descargar XML</strong>
    siempre trae la versión activa más reciente. Si ya existe un XML, el botón cambia de «Generar XML»
    a <strong>«Regenerar XML»</strong>.
  </p>

  <h3 class="subsection-title">Si el sistema encuentra errores al generar</h3>
  <p>
    El mensaje aparece así: <em>«El sistema encontró los siguientes problemas al generar el XML:»</em>
    seguido de la lista exacta que regresó el generador (por ejemplo, un formato de fecha inválido en
    un compareciente específico). Corrige cada punto en la pantalla correspondiente y vuelve a intentar
    — no es necesario capturar todo de nuevo, solo lo señalado.
  </p>
</section>

<!-- ===================== 12. PASO 6 — ACUSE DEL SAT ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 3 · El Expediente PLD, paso a paso</div>
  <h1 class="chapter-title">12. Paso 6 — Acuse del SAT</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Este es el paso donde el mundo «fuera del sistema» y el sistema se vuelven a encontrar. Todo lo
    que pasa antes de esta pantalla — subir el XML al portal SPPLD y firmarlo con e.firma — ocurre
    <strong>manualmente, en el sitio del SAT</strong>. Esta pantalla es donde regresas para dejar
    constancia de lo que pasó.
  </p>

  ${callout('importante', `
    <p>
      El sistema no puede saber automáticamente si el SAT aceptó o rechazó un aviso — no existe una
      conexión directa entre este sistema y el portal SPPLD. Por eso este paso siempre requiere que
      una persona registre el resultado a mano, con el folio o el motivo que el SAT entregó.
    </p>
  `)}

  <h2 class="section-title">Los tres estados de esta pantalla</h2>

  <h3 class="subsection-title">A. Antes de tener un XML generado</h3>
  <p>
    Mientras el expediente no llegue al estado «XML generado», la pantalla no muestra ningún
    formulario — mostrarlo sería confuso, porque fallaría al intentar guardarlo. En su lugar, explica
    el siguiente paso.
  </p>
  ${figura('15-acuse.jpg', 15, 'Acuse antes de generar el XML: la pantalla explica el paso previo («Primero debes generar el XML antes de poder subirlo al portal del SAT») en vez de mostrar un formulario que fallaría.')}

  <h3 class="subsection-title">B. Con el XML ya generado — dos formularios</h3>
  <p>
    Cuando el aviso está en estado <strong>XML generado</strong>, la pantalla ofrece dos formularios,
    uno junto al otro:
  </p>

  ${tablaCampos('Registrar acuse', [
    ['Folio del aviso (SAT)', 'Texto — obligatorio', 'El folio que el portal SPPLD asignó al aviso al recibir el XML. Sin este dato no se puede enviar el formulario.'],
    ['Folio de portal (opcional)', 'Texto', 'Un identificador adicional del portal, si el SAT lo proporcionó. No es obligatorio.'],
    ['PDF del acuse', 'Archivo — obligatorio', 'El comprobante que el SAT entrega al recibir el aviso. Debe ser un archivo PDF; el botón muestra el nombre del archivo una vez seleccionado.'],
  ])}
  <p>
    Al enviarlo correctamente, el aviso pasa a estado <span class="chip verde">Presentado</span> de
    forma inmediata.
  </p>

  ${tablaCampos('Marcar como rechazado por el SAT', [
    ['Motivo del rechazo', 'Texto largo — obligatorio', 'La explicación que el SAT dio al rechazar el aviso. Se guarda tal cual la escribas — el sistema no la reinterpreta.'],
  ])}
  <p>
    Al enviarlo, el aviso pasa a estado <span class="chip rojo">Rechazado SPPLD</span>.
  </p>

  ${callout('advertencia', `
    <p>
      <strong>Ninguna de las dos acciones se puede deshacer.</strong> Revisa con cuidado el folio y el
      archivo (o el motivo del rechazo) antes de enviar — una vez registrado, el expediente pasa a un
      estado cerrado (ver siguiente sección).
    </p>
  `)}

  <h3 class="subsection-title">C. Después de registrar el resultado — expediente cerrado</h3>
  <p>
    Una vez que se registra el acuse o el rechazo, el expediente queda <strong>cerrado y ya no se
    puede editar</strong> — ni comparecientes, ni actividad, ni un nuevo XML. Es un diseño intencional
    de integridad de auditoría: una vez que el SAT ya dio una respuesta oficial, el expediente se
    congela tal como quedó en ese momento (ver capítulo 19 para el detalle de por qué).
  </p>
  <ul class="normal">
    <li><strong>Si quedó Presentado:</strong> la pantalla muestra una tarjeta de confirmación con estado, fecha de envío, folio del aviso, número de acuse y responsable, más un botón <strong>Descargar acuse</strong> para volver a obtener el PDF cuando lo necesites.</li>
    <li><strong>Si quedó Rechazado SPPLD:</strong> la pantalla muestra el motivo del rechazo registrado y la fecha, con el botón <strong>Reintentar envío</strong> siempre deshabilitado — ver capítulo 19.</li>
  </ul>
</section>

<!-- ===================== 13. PASO 7 — HISTORIAL ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 3 · El Expediente PLD, paso a paso</div>
  <h1 class="chapter-title">13. Paso 7 — Historial y auditoría</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    Una línea de tiempo cronológica y permanente de todo lo que le ha pasado al aviso: detección
    automática, cada guardado de comparecientes o actividad, cada versión de XML generada, el registro
    del acuse o del rechazo — todo con fecha, usuario y una nota explicativa.
  </p>

  ${figura('16-historial.jpg', 16, 'Historial y auditoría: una línea de tiempo permanente («append-only») de todo lo que le ha pasado al aviso, del evento más reciente al más antiguo.')}

  <h2 class="section-title">Qué significa «append-only»</h2>
  <p>
    Es un registro donde <strong>nunca se borra ni se edita un evento ya escrito</strong> — solo se
    agregan eventos nuevos, uno tras otro, como las páginas de una bitácora. Ni siquiera un
    administrador puede editar o eliminar una entrada del historial una vez creada. Esto garantiza que
    lo que el historial dice hoy sea exactamente lo que va a decir en un año, sin importar qué más
    cambie en el sistema.
  </p>

  <h3 class="subsection-title">Cómo leer cada entrada</h3>
  <table class="tabla">
    <thead><tr><th>Elemento</th><th>Qué es</th></tr></thead>
    <tbody>
      <tr><td>Título del evento</td><td>Por ejemplo, <code>COMPARECIENTES_ACTUALIZADOS</code> o <code>DETECCION_AUTOMATICA</code> — el tipo de cambio que ocurrió.</td></tr>
      <tr><td>Chip «Estado anterior → Estado nuevo»</td><td>El cambio de estado exacto, aunque sea del mismo estado al mismo estado (por ejemplo, <code>PENDIENTE → PENDIENTE</code> cuando solo se guardan datos sin cambiar de estado).</td></tr>
      <tr><td>Nota</td><td>Una frase explicando el porqué (por ejemplo, «2 compareciente(s) guardado(s) desde Datos generales»).</td></tr>
      <tr><td>«Por: …»</td><td>Quién hizo el cambio, o «Sistema (automático)» si no lo originó una persona.</td></tr>
    </tbody>
  </table>
</section>

<!-- ===================== 14. DIAGNÓSTICO JURÍDICO ===================== -->
<section class="capitulo parte-inicio">
  <div class="chapter-eyebrow">Parte 4 · Inteligencia y control</div>
  <h1 class="chapter-title">14. Diagnóstico Jurídico Inteligente</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">
    El panel fijo del lado derecho del Expediente PLD, visible en las 7 pantallas sin importar cuál
    esté activa (ver Figura 8 y Figura 9). Se recalcula automáticamente cada vez que se guarda un
    cambio en el expediente.
  </p>

  <h2 class="section-title">Los ocho bloques de información</h2>
  <table class="tabla">
    <thead><tr><th>#</th><th>Bloque</th><th>Contenido</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>Veredicto</td><td>«Genera Aviso PLD» / «No genera Aviso PLD» / «Requiere revisión manual».</td></tr>
      <tr><td>2</td><td>Fundamento</td><td>El inciso legal aplicable y la explicación de por qué (incluye el umbral económico y el valor analizado cuando aplica un monto).</td></tr>
      <tr><td>3</td><td>Requisitos del expediente</td><td>Porcentaje de avance y checklist de lo que falta capturar — el mismo dato que ves en Validaciones, aquí condensado.</td></tr>
      <tr><td>4</td><td>Documentos requeridos</td><td>Lista de documentos que la regla exige para este tipo de acto, marcados como pendientes de verificación manual.</td></tr>
      <tr><td>5</td><td>Validaciones pendientes</td><td>Los mismos puntos de la pantalla Validaciones, en formato de lista corta.</td></tr>
      <tr><td>6</td><td>Advertencias jurídicas</td><td>Alertas propias de la regla aplicable (por ejemplo, riesgo de subvaluación en una donación).</td></tr>
      <tr><td>7</td><td>Nivel de riesgo</td><td>Bajo / Medio / Alto — criterio detallado abajo.</td></tr>
      <tr><td>8</td><td>Acciones recomendadas</td><td>Próximos pasos concretos, cada uno con un enlace directo a la pantalla donde se resuelve.</td></tr>
    </tbody>
  </table>

  ${callout('nota', `
    <p>
      Los bloques 4 (Documentos requeridos) y 5 (Validaciones pendientes) responden preguntas
      distintas: el 4 dice <em>qué exige la ley</em> según el tipo de acto (información legal, no
      cambia con lo que captures); el 5 dice <em>qué te falta capturar todavía en este expediente
      concreto</em> (información operativa, cambia con cada guardado). No son lo mismo, aunque a veces
      se parezcan.
    </p>
  `)}

  <h2 class="section-title">Cómo se calcula el nivel de riesgo</h2>
  <p>
    El nivel de riesgo <strong>no es un criterio legal nuevo</strong>: es una capa de prioridad visual
    construida únicamente a partir de datos que el sistema ya calculó en otro lado — nunca inventa un
    criterio adicional.
  </p>
  <table class="tabla">
    <thead><tr><th>Nivel</th><th>Cuándo aplica</th></tr></thead>
    <tbody>
      <tr>
        <td><span class="chip rojo">Alto</span></td>
        <td>
          El motor no pudo decidir si aplica PLD (requiere revisión manual) · o la detección automática
          marcó «requiere revisión» · o la fecha límite ya venció sin que el aviso esté resuelto · o el
          SAT ya rechazó el aviso.
        </td>
      </tr>
      <tr>
        <td><span class="chip naranja">Medio</span></td>
        <td>Sí aplica PLD, no está vencido, pero todavía faltan datos que pide la regla o hay advertencias jurídicas sin resolver.</td>
      </tr>
      <tr>
        <td><span class="chip verde">Bajo</span></td>
        <td>No genera obligación PLD · o el aviso ya llegó a un estado terminal sin pendientes (Presentado, No aplica, Cancelado) · o aplica PLD pero está completamente al día.</td>
      </tr>
    </tbody>
  </table>

  <div class="pregunta">
    <h4>Mi aviso tiene todos los datos capturados, ¿por qué el Diagnóstico dice «Riesgo alto»?</h4>
    <p>
      Revisa la fecha límite en el Sidebar. Un expediente completo pero <strong>vencido</strong> se
      sigue marcando en Riesgo alto — completar los datos no cambia el hecho de que ya pasó la fecha
      límite; ese aviso necesita atención urgente para presentarse cuanto antes.
    </p>
  </div>
</section>

<!-- ===================== 15. CICLO DE VIDA ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 4 · Inteligencia y control</div>
  <h1 class="chapter-title">15. Ciclo de vida completo de un aviso</h1>
  <div class="chapter-rule"></div>

  <h2 class="section-title">El camino más común</h2>
  <div class="flujo">
    <div class="flujo-caja">Pendiente</div><div class="flujo-flecha">→</div>
    <div class="flujo-caja">Listo</div><div class="flujo-flecha">→</div>
    <div class="flujo-caja">XML generado</div><div class="flujo-flecha">→</div>
    <div class="flujo-caja exito">Presentado</div>
  </div>
  <p class="flujo-nota">
    Desde «XML generado», el aviso también puede terminar en <span class="chip rojo" style="vertical-align:1px">Rechazado SPPLD</span>
    si el SAT no acepta el envío, en vez de avanzar a Presentado.
  </p>

  <h2 class="section-title">Los ocho estados posibles</h2>
  <table class="tabla">
    <thead><tr><th>Estado</th><th>Significado</th></tr></thead>
    <tbody>
      <tr><td><span class="chip naranja">Pendiente</span></td><td>Detectado automáticamente; falta capturar datos.</td></tr>
      <tr><td><span class="chip gris">Pendiente (DeclaraNot)</span></td><td>Aviso cuyo portal de destino es DeclaraNot en vez de SPPLD (flujo fiscal separado — ver capítulo 21, Glosario).</td></tr>
      <tr><td><span class="chip azul">Listo</span></td><td>Datos completos, todavía sin XML generado.</td></tr>
      <tr><td><span class="chip azul">XML generado</span></td><td>El XML ya existe; falta subirlo al SAT y registrar el resultado.</td></tr>
      <tr><td><span class="chip verde">Presentado</span></td><td>Acuse registrado — expediente cerrado, inmutable.</td></tr>
      <tr><td><span class="chip rojo">Rechazado SPPLD</span></td><td>El SAT rechazó el aviso — expediente cerrado, inmutable.</td></tr>
      <tr><td><span class="chip gris">No aplica</span></td><td>El motor determinó que esta escritura no genera obligación PLD.</td></tr>
      <tr><td><span class="chip gris">Cancelado</span></td><td>El aviso se canceló (por ejemplo, porque se borró la escritura que le dio origen).</td></tr>
    </tbody>
  </table>

  ${callout('importante', `
    <p>
      Los estados <strong>Presentado</strong>, <strong>Rechazado SPPLD</strong> y <strong>Cancelado</strong>
      son inmutables: una vez ahí, ya no se pueden editar comparecientes ni actividad. Esto es
      intencional — protege la integridad del expediente una vez que ya se le dio una respuesta
      oficial o se cerró por otra razón.
    </p>
  `)}
</section>

<!-- ===================== 16. ROLES Y PERMISOS ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 4 · Inteligencia y control</div>
  <h1 class="chapter-title">16. Roles y permisos</h1>
  <div class="chapter-rule"></div>

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
    El rol PLD se calcula a partir del rol del sistema del usuario: Administrador → Administrador,
    Abogado → Notario, Asistente → Capturista, Protocolito/Recepción → Consulta.
  </p>
  ${callout('nota', `
    <p>El sistema nunca muestra un botón de una acción que el backend fuera a rechazar por permisos — si no ves un botón, es porque tu rol no lo tiene habilitado, no un error.</p>
  `)}
</section>

<!-- ===================== 17. FLUJO RECOMENDADO ===================== -->
<section class="capitulo parte-inicio">
  <div class="chapter-eyebrow">Parte 5 · Referencia rápida</div>
  <h1 class="chapter-title">17. Flujo recomendado, de principio a fin</h1>
  <div class="chapter-rule"></div>

  <p class="chapter-intro">Los nueve pasos completos, incluyendo el tramo que ocurre fuera del sistema.</p>

  <div class="paso"><div class="num">1</div><div class="txt"><strong>Guarda la Escritura</strong> normalmente en el módulo de Escrituras — el sistema detecta en automático si genera obligación PLD.</div></div>
  <div class="paso"><div class="num">2</div><div class="txt"><strong>Abre el Expediente PLD</strong> desde la columna PLD de Escrituras, o desde Detección Automática (si no existe todavía, se crea en ese momento).</div></div>
  <div class="paso"><div class="num">3</div><div class="txt"><strong>Captura los comparecientes</strong> en Datos generales, con su rol correspondiente.</div></div>
  <div class="paso"><div class="num">4</div><div class="txt"><strong>Captura la actividad</strong>: los datos específicos del tipo de acto y el tipo de alerta UIF.</div></div>
  <div class="paso"><div class="num">5</div><div class="txt"><strong>Revisa Validaciones</strong> (o el panel de Diagnóstico Jurídico) para confirmar que no falte nada.</div></div>
  <div class="paso"><div class="num">6</div><div class="txt"><strong>Genera el XML</strong> y descárgalo.</div></div>
  <div class="paso"><div class="num">7</div><div class="txt"><strong>Fuera del sistema:</strong> sube el XML al portal SPPLD y fírmalo con e.firma.</div></div>
  <div class="paso"><div class="num">8</div><div class="txt"><strong>De vuelta en el sistema, en Acuse</strong>, registra el folio y el PDF del acuse del SAT (o marca el rechazo, si aplica).</div></div>
  <div class="paso"><div class="num">9</div><div class="txt">El expediente queda cerrado; todo el proceso queda documentado en <strong>Historial</strong>.</div></div>
</section>

<!-- ===================== 18. BUENAS PRÁCTICAS ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 5 · Referencia rápida</div>
  <h1 class="chapter-title">18. Buenas prácticas y recomendaciones</h1>
  <div class="chapter-rule"></div>

  ${callout('consejo', `<p><strong>Genera el XML solo cuando Validaciones muestre 100% completo.</strong> Regenerarlo después de corregir un dato es gratis y rápido, pero cada regeneración crea una versión nueva — mejor llegar a esa pantalla con todo listo.</p>`)}

  ${callout('consejo', `<p><strong>Verifica con cuidado el folio y el PDF antes de «Registrar acuse».</strong> Es una acción que no se puede deshacer: una vez enviada, el expediente queda cerrado tal como lo registraste.</p>`)}

  ${callout('consejo', `<p><strong>Guarda una copia del PDF del acuse fuera del sistema</strong> como respaldo adicional, además de la que queda almacenada en el expediente.</p>`)}

  ${callout('consejo', `<p><strong>Revisa la tarjeta «Vencidos» del Panel de Control con regularidad.</strong> Es la forma más rápida de ver, de un vistazo, todos los avisos que necesitan atención urgente.</p>`)}

  ${callout('consejo', `<p><strong>Si un caso aparece como «Requiere revisión manual», atiéndelo cuanto antes.</strong> El Diagnóstico Jurídico lo marca en Riesgo alto mientras siga en ese estado, precisamente porque el sistema no puede decidir solo.</p>`)}

  ${callout('consejo', `<p><strong>No dejes la presentación para el último día.</strong> Aunque el sistema calcula la fecha límite automáticamente, generar el XML y presentarlo requiere pasos manuales fuera del sistema (e.firma, portal SPPLD) que toman tiempo.</p>`)}
</section>

<!-- ===================== 19. ERRORES COMUNES ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 5 · Referencia rápida</div>
  <h1 class="chapter-title">19. Errores comunes y cómo resolverlos</h1>
  <div class="chapter-rule"></div>

  <table class="tabla">
    <thead><tr><th>Mensaje o situación</th><th>Qué significa</th><th>Qué hacer</th></tr></thead>
    <tbody>
      <tr>
        <td>«Catálogo oficial "…" pendiente de cargar»</td>
        <td>El catálogo SAT/UIF de ese campo todavía no tiene valores oficiales cargados en el sistema.</td>
        <td>Contacta al administrador. No hay nada que puedas capturar tú mismo hasta que se cargue.</td>
      </tr>
      <tr>
        <td>«Formato no coincide con RFC físico/moral»</td>
        <td>El RFC no cumple el patrón oficial.</td>
        <td>Verifica mayúsculas, sin espacios ni guiones — compáralo con los ejemplos del capítulo 8.</td>
      </tr>
      <tr>
        <td>«Formato de CURP no válido»</td>
        <td>No cumple el patrón de 18 caracteres de la CURP.</td>
        <td>Verifica que copiaste la CURP completa, en mayúsculas.</td>
      </tr>
      <tr>
        <td>«El sistema encontró los siguientes problemas al generar el XML: …»</td>
        <td>El backend detectó datos que superan lo que la pantalla ya validó (formatos finos, catálogo, etc.).</td>
        <td>Corrige cada punto listado uno por uno — no son errores genéricos, son específicos de ese dato.</td>
      </tr>
      <tr>
        <td>«Escritura #XXXX no encontrada»</td>
        <td>La Escritura que dio origen a este aviso fue eliminada del módulo de Escrituras.</td>
        <td>El aviso ya existente sigue siendo consultable en Historial/Panel de Control, pero no se puede reabrir el flujo de captura de ese expediente.</td>
      </tr>
      <tr>
        <td>El botón «Generar XML» no aparece o está deshabilitado</td>
        <td>Falta permiso de tu rol, o el aviso no está en un estado que lo permita.</td>
        <td>Revisa el capítulo 16 (Roles y permisos) y el estado actual del aviso en el Sidebar.</td>
      </tr>
      <tr>
        <td>«Reintentar» aparece deshabilitado en un aviso Rechazado</td>
        <td>Es intencional: corregir un aviso ya rechazado requeriría presentar un <strong>aviso modificatorio</strong> — el modelo de datos ya reserva espacio para esa funcionalidad, pero todavía no está construida en el sistema.</td>
        <td>Por ahora no hay una acción disponible dentro del sistema para ese caso — documenta el seguimiento manualmente.</td>
      </tr>
    </tbody>
  </table>
</section>

<!-- ===================== 20. PREGUNTAS FRECUENTES ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 5 · Referencia rápida</div>
  <h1 class="chapter-title">20. Preguntas frecuentes</h1>
  <div class="chapter-rule"></div>

  <div class="pregunta">
    <h4>¿Por qué no puedo editar un aviso Presentado o Rechazado?</h4>
    <p>
      Es intencional. Una vez que el SAT ya recibió una respuesta (positiva o negativa), el expediente
      se congela para proteger la trazabilidad — ver capítulo 15.
    </p>
  </div>

  <div class="pregunta">
    <h4>¿El sistema rastrea qué documentos físicos ya se recibieron?</h4>
    <p>
      No todavía. El Diagnóstico Jurídico y el Motor de Reglas indican <em>qué</em> documentos exige la
      ley para cada tipo de acto (bloque 4 del capítulo 14), pero no hay una casilla de
      «recibido / pendiente» por documento — esa verificación sigue siendo manual, fuera del sistema.
    </p>
  </div>

  <div class="pregunta">
    <h4>¿Se puede generar el TXT para DeclaraNot desde aquí?</h4>
    <p>
      No todavía. El sistema distingue el portal SPPLD (LFPIORPI, todo este manual) del sistema
      DeclaraNot (una obligación fiscal distinta, Art. 27 del Código Fiscal de la Federación) — el
      generador de TXT para DeclaraNot está identificado como trabajo futuro, no construido.
    </p>
  </div>

  <div class="pregunta">
    <h4>¿Qué pasa si borro una Escritura que ya tiene Aviso PLD?</h4>
    <p>
      El Aviso PLD no se borra — por diseño de auditoría, un Aviso PLD nunca se elimina. Se cancela
      automáticamente (estado «Cancelado»), salvo que ya esté en un estado inmutable como Presentado.
    </p>
  </div>

  <div class="pregunta">
    <h4>¿Puedo eliminar un Aviso PLD manualmente?</h4>
    <p>
      No. No existe una acción de borrado en ningún punto del sistema — es la misma lógica de
      integridad de auditoría del capítulo 13: todo lo que se genera queda documentado de forma
      permanente.
    </p>
  </div>

  <div class="pregunta">
    <h4>¿Qué significa «Actividad no determinada» en el encabezado del expediente?</h4>
    <p>
      Aparece cuando el sistema todavía no pudo identificar con certeza el tipo de acto de esa
      Escritura — el mismo caso que en Detección Automática se marca como «Requiere revisión manual»
      (capítulo 5).
    </p>
  </div>
</section>

<!-- ===================== 21. GLOSARIO ===================== -->
<section class="capitulo">
  <div class="chapter-eyebrow">Parte 5 · Referencia rápida</div>
  <h1 class="chapter-title">21. Glosario</h1>
  <div class="chapter-rule"></div>

  <table class="tabla">
    <tbody>
      <tr><td style="width:30%"><strong>LFPIORPI</strong></td><td>Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita.</td></tr>
      <tr><td><strong>UIF</strong></td><td>Unidad de Inteligencia Financiera, adscrita a la SHCP — autoridad que recibe los avisos.</td></tr>
      <tr><td><strong>SAT</strong></td><td>Servicio de Administración Tributaria — conducto por el cual se presentan los avisos ante la UIF.</td></tr>
      <tr><td><strong>SPPLD</strong></td><td>Sistema del Portal de Prevención de Lavado de Dinero — portal del SAT donde se suben manualmente los avisos PLD.</td></tr>
      <tr><td><strong>DeclaraNot</strong></td><td>Sistema del SAT para declaraciones fiscales de actos notariales (obligación distinta, CFF Art. 27) — no cubierto por este módulo.</td></tr>
      <tr><td><strong>e.firma</strong></td><td>Firma electrónica avanzada del SAT, necesaria para firmar el aviso al subirlo manualmente al portal SPPLD.</td></tr>
      <tr><td><strong>fep.xsd</strong></td><td>Esquema XML oficial que deben cumplir los avisos del SPPLD — el formato exacto que genera este módulo.</td></tr>
      <tr><td><strong>UMA</strong></td><td>Unidad de Medida y Actualización — unidad con la que se expresan los umbrales económicos de la ley.</td></tr>
      <tr><td><strong>Motor de Reglas</strong></td><td>Componente que evalúa una Escritura y determina si genera obligación PLD, con qué fundamento y qué requisitos aplican.</td></tr>
      <tr><td><strong>Aviso PLD</strong></td><td>Registro del sistema que documenta una operación sujeta a PLD, desde su detección hasta su presentación ante el SAT.</td></tr>
      <tr><td><strong>tipoFEP</strong></td><td>Código que identifica el tipo de actividad dentro del esquema fep.xsd (por ejemplo, poder, cesión de fideicomiso, mutuo).</td></tr>
      <tr><td><strong>Diagnóstico Jurídico</strong></td><td>Panel del Expediente PLD que combina el veredicto del Motor de Reglas con la completitud operativa del expediente.</td></tr>
      <tr><td><strong>Append-only</strong></td><td>Diseño de registro donde solo se agregan eventos nuevos — nunca se edita ni se borra uno ya existente. Así funcionan el Historial (capítulo 13) y, en general, todo el módulo PLD.</td></tr>
      <tr><td><strong>Aviso modificatorio</strong></td><td>Mecanismo para corregir un aviso ya rechazado o presentado con error — reservado en el modelo de datos, pero todavía no construido como funcionalidad.</td></tr>
    </tbody>
  </table>

  <p class="footer-final">Manual generado automáticamente por el Sistema Notarial — Notaría Pública No. 17, Ciudad Juárez, Chihuahua.</p>
</section>

</body>
</html>`;
}

module.exports = { generarHTMLManualPLD };
