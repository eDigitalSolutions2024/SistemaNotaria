'use strict';
/**
 * docxTransformer.js
 *
 * Resuelve el problema de los "runs fragmentados" de Word:
 * Word divide el texto en múltiples <w:r> cuando el usuario edita
 * o cuando el control de cambios está activo, por lo que una frase
 * como "Acta No. 10,670 Libro XI" puede quedar en 8 runs distintos.
 *
 * Estrategias de reconstrucción:
 *   mergeAll    – fusiona TODOS los runs de texto consecutivos en uno
 *                 (útil para pie de página y fecha, donde el formato
 *                 es homogéneo o no importa preservarlo).
 *   groupByBold – fusiona solo los runs con el MISMO estado bold,
 *                 conservando la alternancia negrita/normal del original
 *                 (imprescindible para la Sección VI. REGISTRO).
 */

const PizZip = require('pizzip');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de texto / XML
// ─────────────────────────────────────────────────────────────────────────────

/** Concatena todo el texto visible de un párrafo (ignora tabs y fields). */
function getAllText(pXml) {
  return (pXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) ?? [])
    .map(t => t.replace(/<[^>]+>/g, ''))
    .join('');
}

/** Construye un <w:r> con su rPr y texto. */
function buildRun(rPr, text) {
  if (text == null || text === '') return '';
  const spaceAttr = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return rPr
    ? `<w:r>${rPr}<w:t${spaceAttr}>${text}</w:t></w:r>`
    : `<w:r><w:t${spaceAttr}>${text}</w:t></w:r>`;
}

/** Devuelve true si el rPr XML activa negrita sin cancelarla explícitamente. */
function isBoldRpr(rPr) {
  return /<w:b(?:\s|\/|>)/.test(rPr) && !/<w:b\s+w:val="0"/.test(rPr);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokenizer de párrafo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Descompone el XML de un párrafo en tokens tipados.
 * Tipos: 'text' | 'tab' | 'fld' | 'raw'
 *
 * Los tokens de tipo 'text' incluyen un campo `bold` (boolean) derivado del rPr,
 * que permite al reconstructor agrupar runs por estado de negrita.
 *
 * @returns {{ pPr: string, pAttrs: string, tokens: Array }}
 */
function tokenizeParagraph(pXml) {
  const pOpenMatch = pXml.match(/^<w:p(\s[^>]*)?>/);
  const pAttrs = pOpenMatch?.[1] ?? '';

  const bodyXml = pXml
    .replace(/^<w:p(?:\s[^>]*)?>/, '')
    .replace(/<\/w:p>\s*$/, '');

  const pPrMatch = bodyXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch?.[0] ?? '';

  const tokens = [];
  const runRe = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  let prevEnd = 0;
  let m;

  while ((m = runRe.exec(bodyXml)) !== null) {
    if (m.index > prevEnd) {
      const between = bodyXml.slice(prevEnd, m.index);
      if (between.trim() && !/<w:pPr/.test(between)) {
        tokens.push({ type: 'raw', xml: between });
      }
    }

    const rXml = m[0];

    if (/<w:tab\s*\/>/.test(rXml)) {
      tokens.push({ type: 'tab', xml: rXml });
    } else if (/<w:fldChar|<w:instrText/.test(rXml)) {
      tokens.push({ type: 'fld', xml: rXml });
    } else {
      const rPrM = rXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      const rPr2 = rPrM?.[0] ?? '';
      const tM   = rXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/);
      const text = tM?.[1] ?? '';
      const bold = isBoldRpr(rPr2);
      tokens.push({ type: 'text', rPr: rPr2, bold, text });
    }

    prevEnd = m.index + m[0].length;
  }

  if (prevEnd < bodyXml.length) {
    const remainder = bodyXml.slice(prevEnd);
    if (remainder.trim()) tokens.push({ type: 'raw', xml: remainder });
  }

  return { pPr, pAttrs, tokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconstructor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reagrupa los text-runs, aplica los reemplazos y reconstruye el XML del párrafo.
 *
 * strategy:
 *   'mergeAll'    – todos los text-runs consecutivos se fusionan en uno
 *                   (usa el rPr del primer run del grupo).
 *   'groupByBold' – fusiona runs consecutivos solo si comparten el mismo
 *                   estado de negrita; genera un run separado por cada zona
 *                   bold/plain, preservando la alternancia del original.
 *
 * replacements: Array<{ from, to, boldOnly?, plainOnly? }>
 *   boldOnly:  si true, el reemplazo solo aplica a grupos en negrita.
 *   plainOnly: si true, el reemplazo solo aplica a grupos sin negrita.
 */
function rebuildParagraph({ pPr, pAttrs, tokens }, replacements, strategy = 'mergeAll') {
  const parts = [];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok.type === 'text') {
      const bold = tok.bold;
      const grp  = [tokens[i++]];

      if (strategy === 'groupByBold') {
        // Agrupar solo runs con el mismo estado bold
        while (i < tokens.length && tokens[i].type === 'text' && tokens[i].bold === bold) {
          grp.push(tokens[i++]);
        }
      } else {
        // mergeAll: agrupar todos los text-runs consecutivos sin importar bold
        while (i < tokens.length && tokens[i].type === 'text') grp.push(tokens[i++]);
      }

      let merged = grp.map(g => g.text).join('');
      const rPr = grp[0].rPr;

      for (const repl of replacements) {
        if (repl.boldOnly  && !bold) continue;
        if (repl.plainOnly &&  bold) continue;
        merged = merged.replace(repl.from, repl.to);
      }

      parts.push(buildRun(rPr, merged));
    } else {
      // Tabs, fields y raw se conservan tal cual
      parts.push(tok.xml);
      i++;
    }
  }

  return `<w:p${pAttrs}>${pPr}${parts.join('')}</w:p>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reglas de inyección de placeholders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cada regla tiene:
 *   detect       – regex que se evalúa sobre el texto completo del párrafo
 *   strategy     – 'mergeAll' (default) | 'groupByBold'
 *   replacements – lista de { from, to, boldOnly?, plainOnly? }
 */
const INJECTION_RULES = [
  {
    // ── PIE DE PÁGINA ──────────────────────────────────────────────────────
    // Texto actual: "Acta No. 10,670 Libro XI"  [tabs]  "SNRG"
    // Resultado:    "Acta No. {{NUM_TRAMITE}} Libro {{VOLUMEN_ROMANO}}"  [tabs]  "{{INICIALES}}"
    detect: /Acta\s+No\.\s+[\d,]+\s+Libro\s+[IVXLCDM]+/i,
    strategy: 'mergeAll',
    replacements: [
      {
        from: /Acta\s+No\.\s+[\d,]+\s+Libro\s+[IVXLCDM]+/gi,
        to:   'Acta No. {{NUM_TRAMITE}} Libro {{VOLUMEN_ROMANO}}',
      },
      {
        // El grupo de iniciales (texto post-tabs): solo letras mayúsculas, 2-8 caracteres
        from: /^[A-ZÁÉÍÓÚÑ]{2,8}$/,
        to:   '{{INICIALES}}',
      },
    ],
  },
  {
    // ── SECCIÓN VI. REGISTRO ───────────────────────────────────────────────
    // Estrategia groupByBold: preserva la alternancia negrita/normal original.
    //
    // Estructura de runs (negrita marcada):
    //   [BOLD] "VI. REGISTRO"
    //   [plain] "... bajo el número "
    //   [BOLD] "10,670 (diez mil seiscientos setenta) "
    //   [plain] "del "
    //   [BOLD] "Libro Décimo Primero "
    //   [plain] "de Registro de Actas..."
    //
    // Los reemplazos con boldOnly:true solo actúan sobre grupos en negrita,
    // evitando tocar "artículo 150" o cualquier número del texto corrido.
    detect: /bajo el n[uú]mero\s+[\d,]+\s+\([^)]+\)\s+del\s+Libro/i,
    strategy: 'groupByBold',
    replacements: [
      {
        // Grupo BOLD: "10,670 (diez mil seiscientos setenta)"
        from: /[\d,]+\s+\([^)]+\)/gi,
        to:   '{{NUM_TRAMITE}} ({{NUM_TRAMITE_LETRAS}})',
        boldOnly: true,
      },
      {
        // Grupo BOLD: "Libro Décimo Primero"
        // Regex no captura el espacio final para preservarlo en el run de salida.
        from: /Libro\s+[A-ZÁÉÍÓÚÑ][A-Za-záéíóúüñÁÉÍÓÚÑ]*(?:\s+[A-Za-záéíóúüñÁÉÍÓÚÑ]+)*/gi,
        to:   'Libro {{LIBRO_LETRAS}}',
        boldOnly: true,
      },
    ],
  },
  {
    // ── FECHA DEL INSTRUMENTO (encabezado "Cd. Juárez, Chih., …") ─────────
    // Texto actual: "Cd. Juárez, Chih., 12 de mes del 2025."
    // Resultado:    "Cd. Juárez, Chih., {{FECHA}}."
    // La fecha está fragmentada en runs con formato mixto; mergeAll permite
    // que el regex la encuentre en un solo texto fusionado.
    detect: /Cd\.\s+Ju[aá]rez/i,
    strategy: 'mergeAll',
    replacements: [
      {
        from: /\d{1,2}\s+de\s+[A-Za-záéíóúüñÁÉÍÓÚÜÑ]+\s+del\s+\d{4}/gi,
        to:   '{{FECHA}}',
      },
    ],
  },
  {
    // ── FECHA EN SECCIÓN RATIFICACIÓN NOTARIAL ────────────────────────────
    // Texto actual: "...el día 1 (número en letras) del mes de noviembre
    //               del año 2025 (dos mil veinticinco)..."
    // Resultado:    "...el día {{FECHA_DIA}} ({{FECHA_DIA_LETRAS}}) del mes de
    //               {{FECHA_MES}} del año {{FECHA_ANIO}} ({{FECHA_ANIO_LETRAS}})..."
    //
    // Estructura bold/plain (común a todos los templates):
    //   [plain] "...el día "
    //   [BOLD]  "1"                     ← solo el número del día
    //   [plain] " (número en letras) del mes de "
    //   [BOLD]  "noviembre "            ← nombre del mes (a veces fragmentado)
    //   [plain] "del año "
    //   [BOLD]  "2025 "                 ← año numérico (a veces fragmentado)
    //   [plain] "(dos mil veinticinco),"
    detect: /el d[ií]a\s+\d{1,2}\s+\([^)]+\)\s+del mes de/i,
    strategy: 'groupByBold',
    replacements: [
      {
        // Grupo BOLD que contiene únicamente el día (1–31)
        from: /^\d{1,2}$/,
        to:   '{{FECHA_DIA}}',
        boldOnly: true,
      },
      {
        // Grupo plain: "(número en letras)" → día en palabras
        from: /número en letras/gi,
        to:   '{{FECHA_DIA_LETRAS}}',
      },
      {
        // Grupo BOLD que contiene el nombre del mes
        from: /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/gi,
        to:   '{{FECHA_MES}}',
        boldOnly: true,
      },
      {
        // Grupo BOLD que contiene el año numérico (cualquier año 20xx)
        from: /20\d{2}/g,
        to:   '{{FECHA_ANIO}}',
        boldOnly: true,
      },
      {
        // Grupo plain: "(dos mil veinticinco)" → año en palabras
        from: /\(dos mil[^)]*\)/gi,
        to:   '({{FECHA_ANIO_LETRAS}})',
      },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════════
  // REGLAS PARA PLANTILLAS EP (Escrituras Públicas: Compraventa, Constitución)
  // ══════════════════════════════════════════════════════════════════════════

  {
    // ── EP: LÍNEA DE VOLUMEN ───────────────────────────────────────────────
    // Texto actual: "--- VOLUMEN DOSCIENTOS SETENTA Y TRES ---"
    //           o:  "--- VOLÚMEN DOSCIENTOS SESENTA Y CINCO ---"
    // Resultado:    "--- VOLUMEN {{VOLUMEN_LETRAS}} ---"
    // VOL[UÚ]MEN cubre "VOLUMEN" (sin acento) y "VOLÚMEN" (con acento).
    detect: /VOL[UÚ]MEN\s+[A-ZÁÉÍÓÚÜÑ]/,
    strategy: 'mergeAll',
    replacements: [
      {
        from: /(VOL[UÚ]MEN)\s+[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑa-záéíóúüñ ]*/gi,
        to:   '$1 {{VOLUMEN_LETRAS}}',
      },
    ],
  },
  {
    // ── EP: LÍNEA DE NÚMERO DE ESCRITURA ──────────────────────────────────
    // Texto actual: "ESCRITURA PÚBLICA NÚMERO DIEZ MIL ... (10,282)."
    // Resultado:    "ESCRITURA PÚBLICA NÚMERO {{NUM_TRAMITE_LETRAS}} ({{NUM_TRAMITE}})."
    detect: /ESCRITURA PÚBLICA NÚMERO\s+[A-ZÁÉÍÓÚÜÑ]/,
    strategy: 'mergeAll',
    replacements: [
      {
        from: /ESCRITURA PÚBLICA NÚMERO\s+[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑa-záéíóúüñ\s]+\(\s*[\d,]+\s*\)/gi,
        to:   'ESCRITURA PÚBLICA NÚMERO {{NUM_TRAMITE_LETRAS}} ({{NUM_TRAMITE}})',
      },
    ],
  },
  {
    // ── EP: FECHA EN APERTURA ──────────────────────────────────────────────
    // Texto actual: "...a los 24 (veinticuatro) días del mes de noviembre
    //               del año 2025 (dos mil veinticinco)..."
    // Resultado:    "...a los {{FECHA_DIA}} ({{FECHA_DIA_LETRAS}}) días del
    //               mes de {{FECHA_MES}} del año {{FECHA_ANIO}} ({{FECHA_ANIO_LETRAS}})..."
    detect: /a los \d{1,2}\s*\([^)]+\)\s+d[ií]as?\s+del mes de/i,
    strategy: 'mergeAll',
    replacements: [
      {
        from: /a los\s+\d{1,2}\s*\([^)]+\)\s+d[ií]as?\s+del mes de\s+[a-záéíóúüñ]+\s+del año\s+\d{4}\s*\([^)]+\)/gi,
        to:   'a los {{FECHA_DIA}} ({{FECHA_DIA_LETRAS}}) días del mes de {{FECHA_MES}} del año {{FECHA_ANIO}} ({{FECHA_ANIO_LETRAS}})',
      },
    ],
  },
  {
    // ── EP COMPRAVENTA: NOMBRES DE PERSONA ────────────────────────────────
    // Texto actual: "NOMBRE Y APELLIDO VENDEDOR" / "NOMBRE Y APELLIDO COMPRADOR" /
    //               "NOMBRE Y APELLIDO COMPRADORA"
    // Resultado:    "{{PERSONA1_NOMBRE}}" / "{{PERSONA2_NOMBRE}}" / "{{PERSONA3_NOMBRE}}"
    // COMPRADORA debe ir antes que COMPRADOR (más largo primero).
    detect: /NOMBRE Y APELLIDO/,
    strategy: 'mergeAll',
    replacements: [
      { from: /NOMBRE Y APELLIDO COMPRADORA/gi, to: '{{PERSONA3_NOMBRE}}' },
      { from: /NOMBRE Y APELLIDO COMPRADOR/gi,  to: '{{PERSONA2_NOMBRE}}' },
      { from: /NOMBRE Y APELLIDO VENDEDOR/gi,   to: '{{PERSONA1_NOMBRE}}' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Procesador de archivos XML dentro del ZIP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Procesa una cadena XML completa (document.xml, footer*.xml, header*.xml),
 * transformando los párrafos que coinciden con alguna regla.
 */
function transformXmlContent(xmlContent, rules) {
  return xmlContent.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, pXml => {
    const fullText = getAllText(pXml);

    for (const rule of rules) {
      if (rule.detect.test(fullText)) {
        const parsed = tokenizeParagraph(pXml);
        return rebuildParagraph(parsed, rule.replacements, rule.strategy ?? 'mergeAll');
      }
    }

    return pXml;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recibe un Buffer de un .docx, inyecta los {{PLACEHOLDERS}} en los patrones
 * conocidos (pie de página y Sección VI) y devuelve un nuevo Buffer.
 *
 * El archivo original NO se modifica.
 */
function injectPlaceholders(docxBuffer) {
  const zip = new PizZip(docxBuffer);

  const XML_TARGETS = [
    'word/document.xml',
    'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml',
    'word/header1.xml', 'word/header2.xml', 'word/header3.xml',
  ];

  const report = { modified: [], unchanged: [] };

  for (const target of XML_TARGETS) {
    if (!zip.files[target]) continue;

    const original    = zip.files[target].asText();
    const transformed = transformXmlContent(original, INJECTION_RULES);

    if (transformed !== original) {
      zip.file(target, transformed);
      report.modified.push(target);
    } else {
      report.unchanged.push(target);
    }
  }

  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, report };
}

module.exports = { injectPlaceholders, transformXmlContent, INJECTION_RULES, getAllText };
