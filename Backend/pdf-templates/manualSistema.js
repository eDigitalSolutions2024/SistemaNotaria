// pdf-templates/manualSistema.js
//
// Manual de usuario de TODO el sistema (todos los módulos), generado en
// HTML para que routes/manual.js lo convierta a PDF con Puppeteer — mismo
// patrón que pdf-templates/manualPLD.js. Contenido estático, no depende de
// ningún registro de la base de datos.
//
// A propósito NO importa nada de manualPLD.js: son archivos hermanos que
// duplican su CSS/helpers a propósito (ver nota de diseño en ese archivo)
// para no arriesgar el manual del módulo PLD, que ya está en uso, al tocar
// código compartido. Si algún día se vuelve a tocar manualPLD.js conviene
// extraer esto a un helper común — hoy no.
//
// El capítulo de PLD aquí es un RESUMEN a propósito — el manual completo y
// detallado de ese módulo (21 secciones) ya existe aparte y se descarga
// desde el propio módulo PLD ("Manual (PDF)"), así que no se duplica.
const fs = require('fs');
const path = require('path');

function cargarLogoBase64() {
  try {
    const logoPath = path.join(__dirname, 'asstes', 'logo.png');
    if (fs.existsSync(logoPath)) {
      return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
    }
  } catch (e) {
    console.error('No se pudo cargar el logo para el manual del sistema:', e.message);
  }
  return '';
}

// Capturas reales del sistema en ejecución — viven en
// pdf-templates/asstes/manual-sistema/ (ver LEEME.txt en esa carpeta para
// el nombre exacto que espera cada una). Mientras no exista el archivo,
// figura() dibuja un recuadro de "captura pendiente" en su lugar, para que
// el manual sea útil y completo aun sin las imágenes todavía.
function cargarFiguraBase64(nombreArchivo) {
  try {
    const imgPath = path.join(__dirname, 'asstes', 'manual-sistema', nombreArchivo);
    if (fs.existsSync(imgPath)) {
      const ext = path.extname(nombreArchivo).toLowerCase() === '.png' ? 'png' : 'jpeg';
      return `data:image/${ext};base64,${fs.readFileSync(imgPath).toString('base64')}`;
    }
  } catch (e) {
    console.error(`No se pudo cargar la captura "${nombreArchivo}" del manual del sistema:`, e.message);
  }
  return '';
}

function figura(nombreArchivo, numero, titulo) {
  const src = cargarFiguraBase64(nombreArchivo);
  if (!src) {
    return `
    <div class="figura figura-pendiente">
      <div class="figura-pendiente-caja">
        <span>Captura pendiente</span>
      </div>
      <figcaption><strong>Figura ${numero}.</strong> ${titulo}</figcaption>
    </div>`;
  }
  return `
    <figure class="figura">
      <img src="${src}" alt="${titulo}" />
      <figcaption><strong>Figura ${numero}.</strong> ${titulo}</figcaption>
    </figure>`;
}

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

function pasos(items) {
  const cuerpo = items.map((it, i) => `
      <div class="paso">
        <div class="num">${i + 1}</div>
        <div class="txt"><strong>${it.titulo}</strong>${it.detalle ? ` ${it.detalle}` : ''}</div>
      </div>`).join('');
  return `<div class="pasos">${cuerpo}</div>`;
}

function generarHTMLManualSistema() {
  const logoSrc = cargarLogoBase64();
  const fechaGenerado = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Manual del Sistema Notarial</title>
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
    min-height: 247mm;
    display: flex; flex-direction: column; justify-content: center;
  }
  .portada-logo { height: 90px; width: auto; align-self: center; margin: 0 auto 10mm; }
  .portada-eyebrow {
    font-size: 10pt; color: #2563eb; letter-spacing: 0.12em; text-transform: uppercase;
    font-weight: 700; margin-bottom: 5mm;
  }
  .portada-titulo { font-size: 30pt; line-height: 1.15; margin-bottom: 6mm; max-width: 140mm; }
  .portada-linea { width: 26mm; height: 3px; background: #2563eb; margin-bottom: 8mm; }
  .portada-subtitulo { font-size: 12.5pt; color: #475569; max-width: 130mm; line-height: 1.6; margin-bottom: 18mm; }
  .portada-meta { border-top: 1px solid #e2e8f0; padding-top: 5mm; font-size: 9.5pt; color: #94a3b8; }
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
  .toc li::before { content: counter(toc) "."; font-weight: 700; color: #2563eb; min-width: 6mm; }

  /* ===== Capítulos ===== */
  .chapter-eyebrow {
    font-size: 9pt; color: #2563eb; text-transform: uppercase; letter-spacing: 0.1em;
    font-weight: 700; margin-bottom: 2mm;
  }
  h1.chapter-title { font-size: 21pt; margin-bottom: 4mm; page-break-after: avoid; }
  .chapter-rule { border: none; border-top: 3px solid #2563eb; width: 22mm; margin: 0 0 8mm; }
  .chapter-intro { font-size: 11pt; color: #334155; }

  h2.section-title {
    font-size: 14pt; margin: 10mm 0 3.5mm; padding-bottom: 2mm;
    border-bottom: 1px solid #e2e8f0; page-break-after: avoid;
  }
  h3.subsection-title { font-size: 11.5pt; margin: 6mm 0 2.5mm; page-break-after: avoid; }
  h4.minititle { font-size: 10.5pt; margin: 4mm 0 1.5mm; color: #1e293b; page-break-after: avoid; }

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

  /* ===== Tablas ===== */
  table.tabla { width: 100%; border-collapse: collapse; margin: 4mm 0 5mm; font-size: 9.5pt; }
  table.tabla th {
    text-align: left; font-weight: 700; color: #0f172a; padding: 2.3mm 3mm;
    border-bottom: 2px solid #cbd5e1; background: #f8fafc;
  }
  table.tabla td { padding: 2.3mm 3mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  table.tabla tr { page-break-inside: avoid; }
  table.tabla thead { display: table-header-group; }
  table.tabla tr:last-child td { border-bottom: none; }

  /* ===== Pasos numerados ===== */
  .pasos { margin: 4mm 0 5mm; }
  .paso { display: flex; gap: 3.5mm; margin-bottom: 3.5mm; page-break-inside: avoid; align-items: flex-start; }
  .paso .num {
    flex-shrink: 0; width: 7mm; height: 7mm; border-radius: 50%; background: #2563eb; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9.5pt;
  }
  .paso .txt { padding-top: 0.6mm; }
  .paso .txt strong { display: block; margin-bottom: 0.5mm; }

  /* ===== Figuras (capturas) ===== */
  .figura { margin: 5mm 0 6.5mm; page-break-inside: avoid; text-align: center; }
  .figura img {
    width: 100%; border: 1px solid #e2e8f0; border-radius: 6px;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
  }
  .figura figcaption { font-size: 8.8pt; color: #64748b; margin-top: 2.5mm; text-align: left; line-height: 1.5; }
  .figura figcaption strong { color: #334155; }
  .figura-pendiente-caja {
    width: 100%; min-height: 28mm; border: 1.5px dashed #cbd5e1; border-radius: 6px;
    background: #f8fafc; display: flex; align-items: center; justify-content: center;
    color: #94a3b8; font-size: 9.5pt; font-weight: 600; letter-spacing: 0.03em;
  }

  /* ===== Chips de rol ===== */
  .chip { display: inline-block; padding: 0.6mm 2.6mm; border-radius: 10px; font-size: 8.3pt; font-weight: 700; color: #fff; white-space: nowrap; }
  .chip.azul { background: #2563eb; }
  .chip.verde { background: #16a34a; }
  .chip.naranja { background: #d97706; }
  .chip.gris { background: #64748b; }

  .footer-final { font-size: 8.5pt; color: #94a3b8; text-align: center; margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #e2e8f0; }

  /* ===== Vista en pantalla (botón flotante) =====
     Todo lo de arriba está pensado para el PDF (hojas A4, "mm", saltos de
     página). routes/manual.js fuerza @media print al generar el PDF
     (page.emulateMediaType('print')), así que este bloque SOLO se ve en la
     vista previa embebida del navegador — nunca en el PDF descargado — y
     ahí reacomoda el mismo contenido como una página de documentación
     normal: ancho de lectura cómodo, centrado, sin la "hoja" de portada ni
     los saltos de página forzados. */
  @media screen {
    body { background: #eef1f6; }
    .portada, .toc, section.capitulo {
      max-width: 760px; margin-left: auto; margin-right: auto;
      padding-left: 36px; padding-right: 36px;
    }
    .portada {
      min-height: 0; padding-top: 48px; padding-bottom: 40px;
      border-bottom: 1px solid #e2e8f0; background: #ffffff;
    }
    .toc { page-break-before: auto; padding-top: 36px; padding-bottom: 8px; background: #ffffff; }
    section.capitulo { background: #ffffff; padding-top: 36px; padding-bottom: 8px; }
    section.capitulo + section.capitulo { border-top: 1px solid #e2e8f0; }
    .figura img { box-shadow: none; }
  }
</style>
</head>
<body>

<!-- ===================== PORTADA ===================== -->
<div class="portada">
  ${logoSrc ? `<img class="portada-logo" src="${logoSrc}" alt="Notaría 17" />` : ''}
  <div class="portada-eyebrow">Sistema Notarial · Notaría Pública No. 17</div>
  <h1 class="portada-titulo">Manual de Usuario del Sistema</h1>
  <div class="portada-linea"></div>
  <p class="portada-subtitulo">
    Guía completa de todos los módulos del sistema: qué hace cada pantalla, cómo se usa día a día y
    qué reglas (candados, permisos, validaciones) hay que conocer.
  </p>
  <div class="portada-alcance">
    <strong>Alcance de este manual:</strong> todos los módulos del sistema. El módulo de Expedientes PLD
    tiene además su propio manual, mucho más detallado, descargable desde ese mismo módulo con el botón
    "Manual (PDF)" — aquí solo se explica un resumen de su funcionamiento.
  </div>
  <div class="portada-meta">
    <div>Versión 1.0</div>
    <div>Generado el ${fechaGenerado}</div>
    <div>Ciudad Juárez, Chihuahua</div>
  </div>
</div>

<!-- ===================== ÍNDICE ===================== -->
<div class="toc">
  <h2 class="toc-titulo">Contenido</h2>
  <p class="toc-sub">14 secciones organizadas en 5 partes.</p>

  <div class="toc-parte">Parte 1 — Empecemos</div>
  <ol>
    <li>Bienvenida y cómo usar este manual</li>
  </ol>

  <div class="toc-parte">Parte 2 — Recepción y captura</div>
  <ol start="2">
    <li>Registrar Cliente</li>
    <li>Registrar y consultar Generales</li>
    <li>Registrar Abogado</li>
  </ol>

  <div class="toc-parte">Parte 3 — Expedientes y trámites</div>
  <ol start="5">
    <li>Protocolito</li>
    <li>Escrituras</li>
    <li>Validación de Poderes con Inteligencia Artificial</li>
    <li>Expedientes PLD (resumen)</li>
    <li>Custodia de documentos</li>
  </ol>

  <div class="toc-parte">Parte 4 — Cobros y gestión</div>
  <ol start="10">
    <li>Presupuesto</li>
    <li>Recibos</li>
    <li>Gestiones especiales</li>
  </ol>

  <div class="toc-parte">Parte 5 — Organización, administración y referencia</div>
  <ol start="13">
    <li>Calendario y Anuncios</li>
    <li>Glosario</li>
  </ol>
</div>

<!-- ===================== 1. BIENVENIDA ===================== -->
<section class="capitulo" id="bienvenida">
  <div class="chapter-eyebrow">Parte 1 · Empecemos</div>
  <h1 class="chapter-title">1. Bienvenida y cómo usar este manual</h1>
  <div class="chapter-rule"></div>
  <p class="chapter-intro">
    Este manual explica, módulo por módulo, qué hace cada pantalla del sistema y cómo se usa en el
    trabajo diario de la notaría. Está pensado para consultarse por secciones — no hace falta leerlo
    completo de corrido: busca el módulo que necesitas en el índice y ve directo a esa página.
  </p>
  <p>
    Dentro del sistema, el botón flotante con el ícono de ayuda (visible en cualquier pantalla, en la
    esquina) abre una vista previa de este mismo manual con un menú de secciones — te lleva directo a
    la parte que necesitas sin tener que buscar en el PDF completo. Desde ahí también puedes descargar
    este documento.
  </p>
  ${callout('nota', `<p>Las capturas de pantalla de este manual se van agregando conforme se actualiza el sistema.
  Si una sección todavía no tiene una captura, verás un recuadro de "Captura pendiente" en su lugar —
  el texto de esa sección sigue siendo válido y completo de todas formas.</p>`)}
  ${callout('consejo', `<p>Si una pantalla de pronto "rechaza" una acción que antes sí dejaba hacer, lo primero
  que conviene revisar es si tu sesión sigue abierta — después de un rato sin usarla, el sistema la
  cierra y pide iniciar sesión de nuevo antes de dejarte continuar.</p>`)}
</section>

<!-- ===================== 2. REGISTRAR CLIENTE ===================== -->
<section class="capitulo" id="registrar-cliente">
  <div class="chapter-eyebrow">Parte 2 · Recepción y captura</div>
  <h1 class="chapter-title">2. Registrar Cliente</h1>
  <div class="chapter-rule"></div>
  <p>
    Es la pantalla principal de recepción, la que normalmente se ve primero al entrar al sistema.
    En una sola vista reúne: el formulario para dar de alta un cliente nuevo, la tabla de abogados con
    su disponibilidad y la sala donde está asignado cada uno, la tabla de clientes ya registrados y la
    tabla de salas disponibles.
  </p>
  <p>
    Se actualiza sola, en tiempo real: si otro usuario registra un cliente o mueve a un abogado de
    sala en ese momento, lo ves aparecer sin tener que recargar la página.
  </p>
  ${figura('01-registrar-cliente.png', 1, 'Pantalla de Registrar Cliente, con las tablas de abogados, clientes y salas.')}
</section>

<!-- ===================== 3. GENERALES ===================== -->
<section class="capitulo" id="generales">
  <div class="chapter-eyebrow">Parte 2 · Recepción y captura</div>
  <h1 class="chapter-title">3. Registrar y consultar Generales</h1>
  <div class="chapter-rule"></div>
  <p>
    "Generales" son los datos personales de cada compareciente de un trámite: nombre completo, CURP,
    RFC, domicilio, lugar de nacimiento, estado civil, nacionalidad e identificación. Se capturan una o
    varias personas a la vez, ligadas a un cliente.
  </p>
  ${callout('consejo', `<p>Vale la pena capturar estos datos con cuidado — son los mismos que después usa la
  <strong>validación con Inteligencia Artificial</strong> de los Poderes (capítulo 7) para comparar
  contra el documento Word, campo por campo.</p>`)}
  <p>
    "Consultar Generales" es el buscador para encontrar o corregir información ya capturada, sin tener
    que volver a teclearla desde cero.
  </p>
  ${figura('02-registrar-generales.png', 2, 'Formulario de Registrar Generales.')}
  ${figura('03-consultar-generales.png', 3, 'Consultar Generales, con el resultado de una búsqueda (datos del cliente cubiertos por privacidad).')}
</section>

<!-- ===================== 4. REGISTRAR ABOGADO ===================== -->
<section class="capitulo" id="registrar-abogado">
  <div class="chapter-eyebrow">Parte 2 · Recepción y captura</div>
  <h1 class="chapter-title">4. Registrar Abogado</h1>
  <div class="chapter-rule"></div>
  <p>
    Dar de alta a un abogado nuevo es una función exclusiva de administración y no se gestiona desde este
    manual.
  </p>
  ${callout('nota', `<p>Si necesitas dar de alta a un abogado nuevo, contacta directamente al área de
  sistemas — ellos lo registran para que aparezca en las tablas de asignación.</p>`)}
</section>

<!-- ===================== 5. PROTOCOLITO ===================== -->
<section class="capitulo" id="protocolito">
  <div class="chapter-eyebrow">Parte 3 · Expedientes y trámites</div>
  <h1 class="chapter-title">5. Protocolito</h1>
  <div class="chapter-rule"></div>
  <p>
    Control de expedientes de trámites de protocolo — poderes, ratificaciones, compraventas, actas y en
    general todo lo que no es una Escritura numerada aparte. Cada trámite recibe un número consecutivo
    propio y un volumen que el sistema calcula solo.
  </p>
  <h2 class="section-title">Cómo se usa</h2>
  ${pasos([
    { titulo: 'Tomar número.', detalle: 'Da de alta el trámite nuevo con sus datos básicos.' },
    { titulo: 'Elegir plantilla.', detalle: 'Poder Irrevocable, Poder Revocable, PPC Amplio, Ratificación Vehicular, Compraventa Simple, etc.' },
    { titulo: 'Generar el documento.', detalle: 'El sistema rellena la plantilla Word automáticamente con los datos ya capturados, y puede generar también el PDF.' },
    { titulo: 'Cobrar.', detalle: 'Un botón lleva directo a generar el recibo de ese mismo trámite (capítulo 11).' },
  ])}
  ${callout('advertencia', `<p><strong>Candado:</strong> no se pueden tener más de 2 trámites de Protocolito sin
  recibo o justificante por abogado — evita acumular trabajo sin cobrar. Con acceso de administrador
  también se puede activar un candado de "solo lectura" que congela temporalmente la toma de números
  nuevos.</p>`)}
  <p>También se puede importar y exportar la tabla completa desde/hacia Excel.</p>
  ${figura('05-protocolito-tabla.png', 5, 'Tabla de Protocolito (nombres de clientes cubiertos por privacidad).')}
  ${figura('06-protocolito-nuevo.png', 6, 'Selección de cliente al dar de alta un nuevo trámite (nombres de clientes cubiertos por privacidad).')}
</section>

<!-- ===================== 6. ESCRITURAS ===================== -->
<section class="capitulo" id="escrituras">
  <div class="chapter-eyebrow">Parte 3 · Expedientes y trámites</div>
  <h1 class="chapter-title">6. Escrituras</h1>
  <div class="chapter-rule"></div>
  <p>
    El módulo más grande del sistema: control de expedientes de escrituras numeradas. Normalmente cada
    abogado ve solo sus propias escrituras; en algunos casos se habilita ver todas sin poder entregarlas.
    Si esperas ver una escritura y no te aparece, probablemente no es tuya.
  </p>
  <h2 class="section-title">Tomar un número nuevo</h2>
  ${callout('advertencia', `<p><strong>Candado:</strong> no se pueden tener más de 5 Escrituras sin recibo ni
  justificante. Si lo intentas y el sistema te rechaza, es porque hay que cerrar alguna de las
  pendientes primero (con su recibo o su justificante).</p>`)}
  <h2 class="section-title">Lo que trae cada Escritura</h2>
  <ul>
    <li>Estatus de entrega y firma, con su propio checklist de seguimiento.</li>
    <li>Columna de Custodia integrada (capítulo 9): quién tiene el expediente físico en este momento.</li>
    <li>Exportación a Excel y a PDF.</li>
  </ul>
  ${figura('07-escrituras-tabla.png', 7, 'Tabla de Escrituras (nombres de otorgantes cubiertos por privacidad).')}
  ${figura('11-estatus-escritura.jpg', 8, 'Estatus de entrega y firma de una Escritura.')}
</section>

<!-- ===================== 7. IA PODERES ===================== -->
<section class="capitulo" id="ia-poderes">
  <div class="chapter-eyebrow">Parte 3 · Expedientes y trámites</div>
  <h1 class="chapter-title">7. Validación de Poderes con Inteligencia Artificial</h1>
  <div class="chapter-rule"></div>
  <p>
    Al dar de alta una Escritura de tipo <strong>Poder</strong>, el sistema pide subir el documento
    Word ya redactado, y antes de asignar el número lo manda a revisar a una Inteligencia Artificial.
    La IA no redacta ni modifica nada — solo revisa lo que el abogado ya escribió y da retroalimentación.
  </p>
  <h2 class="section-title">Qué entrega la revisión</h2>
  <ul>
    <li><strong>Un porcentaje</strong> de qué tan completo y consistente se ve el documento.</li>
    <li><strong>Un resumen</strong> en una frase del hallazgo más importante.</li>
    <li><strong>Sugerencias concretas:</strong> datos de comparecientes incompletos, facultades mal
      redactadas, cláusula de revocabilidad/irrevocabilidad faltante o ambigua, placeholders sin
      llenar, inconsistencias dentro del propio texto.</li>
    <li><strong>Comparación campo por campo</strong> contra los datos ya capturados en Generales
      (nombre, CURP, RFC, domicilio), marcando cuáles coinciden y cuáles no.</li>
  </ul>
  <p>Además, se puede ver una vista previa del documento Word directamente en el sistema, sin necesidad de abrirlo en Office.</p>
  ${callout('importante', `<p>La revisión es <strong>informativa, no bloquea</strong> nada: aunque el
  porcentaje salga bajo, el abogado decide si corrige el documento o continúa de todas formas. La
  decisión final siempre es humana.</p>`)}
  ${figura('09-ia-resultado.png', 9, 'Resultado de la revisión de IA: porcentaje de coincidencia y botón para ver el detalle (nombres cubiertos por privacidad).')}
  ${figura('10-ia-comparacion.jpg', 10, 'Comparación campo por campo contra los datos capturados en Generales.')}
</section>

<!-- ===================== 8. PLD RESUMEN ===================== -->
<section class="capitulo" id="pld">
  <div class="chapter-eyebrow">Parte 3 · Expedientes y trámites</div>
  <h1 class="chapter-title">8. Expedientes PLD (resumen)</h1>
  <div class="chapter-rule"></div>
  <p>
    Módulo de cumplimiento de la Ley Federal para la Prevención e Identificación de Operaciones con
    Recursos de Procedencia Ilícita (LFPIORPI). Cuando una Escritura genera obligación de aviso, se abre
    un expediente que se trabaja en 7 pasos — navegables libremente, no es un asistente forzado paso a
    paso.
  </p>
  ${pasos([
    { titulo: 'Dashboard.', detalle: 'Vista ejecutiva: qué falta y qué sigue.' },
    { titulo: 'Datos generales.', detalle: 'Comparecientes del aviso.' },
    { titulo: 'Actividad.', detalle: 'El sistema detecta sola, por el texto del trámite, qué actividad vulnerable del Art. 17 aplica y calcula el umbral en pesos según la UMA vigente.' },
    { titulo: 'Validaciones.', detalle: 'No es captura — es un filtro que confirma que todo lo necesario está completo.' },
    { titulo: 'XML.', detalle: 'Genera el archivo en el formato oficial que exige el SAT.' },
    { titulo: 'Acuse.', detalle: 'Se sube manualmente el comprobante de que ya se presentó en el portal.' },
    { titulo: 'Historial.', detalle: 'Bitácora de solo lectura de todo lo que pasó con ese expediente.' },
  ])}
  ${callout('nota', `<p>Si no puedes editar o presentar un expediente que esperabas, puede ser que tu acceso a
  PLD específicamente sea de solo consulta. Este módulo tiene además su propio manual completo de 21
  secciones — descárgalo con el botón "Manual (PDF)" dentro del propio módulo PLD para el detalle paso
  a paso de cada pantalla.</p>`)}
  ${figura('12-pld-dashboard.jpg', 11, 'Dashboard de un expediente PLD.')}
  ${figura('13-pld-pasos.jpg', 12, 'Los 7 pasos del expediente, navegables libremente.')}
</section>

<!-- ===================== 9. CUSTODIA ===================== -->
<section class="capitulo" id="custodia">
  <div class="chapter-eyebrow">Parte 3 · Expedientes y trámites</div>
  <h1 class="chapter-title">9. Custodia de documentos</h1>
  <div class="chapter-rule"></div>
  <p>
    Lleva el control de quién tiene físicamente un expediente (Escritura o Protocolito) en cada momento
    — para nunca perder de vista un expediente que anda circulando entre recepción y los abogados.
  </p>
  ${pasos([
    { titulo: 'Recepción entrega.', detalle: 'Marca en el sistema que le entregó el expediente físico a un abogado.' },
    { titulo: 'El abogado confirma.', detalle: 'Solo el abogado destinatario, desde su propia sesión, puede confirmar que lo recibió — nadie más puede confirmar en su nombre, así no hay forma de decir "yo nunca lo recibí".' },
  ])}
  <p>
    Cada movimiento queda en una bitácora propia que nunca se edita ni se borra. Un banner de
    pendientes, visible en la parte superior de cualquier pantalla, avisa si alguien tiene expedientes
    todavía sin confirmar.
  </p>
  ${figura('14-custodia-entrega.png', 13, 'Estado de custodia de expedientes (nombres de clientes cubiertos por privacidad).')}
  ${figura('15-custodia-banner.jpg', 14, 'Banner de pendientes de custodia.')}
</section>

<!-- ===================== 10. PRESUPUESTO ===================== -->
<section class="capitulo" id="presupuestos">
  <div class="chapter-eyebrow">Parte 4 · Cobros y gestión</div>
  <h1 class="chapter-title">10. Presupuesto</h1>
  <div class="chapter-rule"></div>
  <p>
    Cotización de un trámite antes de que se convierta en Escritura o Protocolito formal: se capturan
    los conceptos (ISR, traslación de dominio, IVA, impuesto predial, gastos, etc.) y el sistema arma el
    total.
  </p>
  ${callout('nota', `<p>Una vez que un presupuesto queda ligado a una Escritura, se vuelve la fuente de
  verdad del monto a cobrar: el recibo de esa escritura siempre toma el total del presupuesto más
  reciente, nunca una cifra guardada aparte.</p>`)}
  <p>Hay también un buscador aparte para consultar presupuestos ya existentes.</p>
  ${figura('16-presupuesto-form.png', 15, 'Formulario de presupuesto con desglose de conceptos.')}
</section>

<!-- ===================== 11. RECIBOS ===================== -->
<section class="capitulo" id="recibos">
  <div class="chapter-eyebrow">Parte 4 · Cobros y gestión</div>
  <h1 class="chapter-title">11. Recibos</h1>
  <div class="chapter-rule"></div>
  <p>
    Si tú generas recibos, verás el menú de Recibos; si no, es porque esa parte la maneja Recepción o un
    administrador — aunque el recibo sea de un trámite tuyo.
  </p>
  ${callout('advertencia', `<p><strong>Candado de monto mínimo:</strong> no se pueden generar recibos de $1
  hasta menos de $100, salvo que ese trámite tenga habilitada la excepción de monto bajo. Esa excepción
  es del abogado dueño del trámite, no de quien está generando el recibo; si la necesitas, pídesela a
  un administrador.</p>`)}
  <p>
    El sistema genera un PDF descargable del recibo. Desde "Consultar recibos" se puede buscar
    cualquier recibo ya emitido, reabrir su PDF, o cancelarlo (la cancelación también queda en la
    bitácora).
  </p>
  ${figura('17-recibo-form.png', 16, 'Formulario de generación de recibo.')}
  ${figura('18-recibo-bloqueo.jpg', 17, 'Mensaje de bloqueo por monto menor al mínimo.')}
</section>

<!-- ===================== 12. GESTIONES ESPECIALES ===================== -->
<section class="capitulo" id="gestiones-especiales">
  <div class="chapter-eyebrow">Parte 4 · Cobros y gestión</div>
  <h1 class="chapter-title">12. Gestiones especiales</h1>
  <div class="chapter-rule"></div>
  <p>
    Módulo para clientes con trámites administrativos recurrentes y externos a la notaría (hoy
    Cervecería y Controladora, con más clientes dándose de alta según se necesite).
  </p>
  <h2 class="section-title">Nueva entrega</h2>
  <p>
    Se capturan varias filas de documentos a la vez (tipo, hojas, cantidad, costo, archivo propio de
    cada fila). Cada entrega lleva además un <strong>SOPORTE</strong>: un único documento obligatorio
    compartido por todas las filas de esa entrega — distinto del archivo propio de cada fila.
  </p>
  <h2 class="section-title">Armar una factura</h2>
  ${pasos([
    { titulo: 'Seleccionar documentos.', detalle: 'Se eligen los documentos todavía no facturados (hay un botón de "elegir todos").' },
    { titulo: 'Descargar soportes (opcional).', detalle: 'Un botón baja en un solo .zip los SOPORTES únicos de lo seleccionado, sin repetir el mismo archivo si varias filas comparten entrega.' },
    { titulo: 'Crear la factura.', detalle: 'Con número y fecha.' },
    { titulo: 'Completar Pedido y Entrada.', detalle: 'Suelen llegar 1-2 semanas después — se capturan libres la primera vez; cambiarlos después requiere el botón "Editar", con contraseña de administrador.' },
    { titulo: 'Subir el Acuse SAT.', detalle: 'Comprobante de que la factura ya se subió al portal. Primera subida libre; reemplazarlo también pide contraseña de administrador.' },
  ])}
  <p>También se puede exportar todo a Excel, con el mismo formato que el Excel manual que este módulo reemplaza.</p>
  ${figura('19-gestiones-tabla.png', 18, 'Tabla de documentos de Cervecería/Controladora.')}
  ${figura('20-gestiones-entrega.jpg', 19, '"Nueva entrega", con el SOPORTE compartido.')}
  ${figura('21-gestiones-factura.jpg', 20, '"Nueva factura", con selección múltiple de documentos.')}
  ${figura('22-gestiones-facturas-lista.jpg', 21, 'Lista de facturas, con Pedido, Entrada y Acuse SAT.')}
</section>

<!-- ===================== 13. CALENDARIO Y ANUNCIOS ===================== -->
<section class="capitulo" id="calendario">
  <div class="chapter-eyebrow">Parte 5 · Organización, administración y referencia</div>
  <h1 class="chapter-title">13. Calendario y Anuncios</h1>
  <div class="chapter-rule"></div>
  <h2 class="section-title">Calendario</h2>
  <p>
    Calendario integrado con el Outlook real del despacho: los eventos que crees aquí se sincronizan
    con Outlook, y viceversa. Tiene vistas de mes, semana y día.
  </p>
  ${figura('23-calendario.jpg', 22, 'Vista mensual del Calendario.')}
  <h2 class="section-title">Anuncios</h2>
  <p>
    Si tienes acceso de administrador puedes redactar y enviar un anuncio a todo el personal conectado
    al instante, en la pantalla donde estén trabajando, sin que tengan que recargar. Quedan guardados en
    un historial, y cada usuario deja constancia de que lo vio al cerrarlo.
  </p>
  ${figura('24-anuncios.jpg', 23, 'Un anuncio tal como lo ve un usuario normal.')}
</section>

<!-- ===================== 14. GLOSARIO ===================== -->
<section class="capitulo" id="glosario">
  <div class="chapter-eyebrow">Parte 5 · Organización, administración y referencia</div>
  <h1 class="chapter-title">14. Glosario</h1>
  <div class="chapter-rule"></div>
  <table class="tabla">
    <tbody>
      <tr><td style="width:28%"><strong>Candado</strong></td><td>Una regla que bloquea una acción hasta que se cumple una condición — por ejemplo, el mínimo de $100 en recibos.</td></tr>
      <tr><td><strong>Abogado Responsable</strong></td><td>El abogado dueño de un trámite — distinto de quién tiene permiso para generar su recibo.</td></tr>
      <tr><td><strong>SOPORTE</strong></td><td>En Gestiones especiales, el documento único compartido por todas las filas de una misma entrega.</td></tr>
      <tr><td><strong>PLD / LFPIORPI</strong></td><td>Prevención de Lavado de Dinero — Ley Federal para la Prevención e Identificación de Operaciones con Recursos de Procedencia Ilícita. Ver capítulo 8.</td></tr>
      <tr><td><strong>UMA</strong></td><td>Unidad de Medida y Actualización — con la que se calculan los umbrales económicos de ley en el módulo PLD.</td></tr>
    </tbody>
  </table>
  <p class="footer-final">Manual generado automáticamente por el Sistema Notarial — Notaría Pública No. 17, Ciudad Juárez, Chihuahua.</p>
</section>

</body>
</html>`;
}

module.exports = { generarHTMLManualSistema };
