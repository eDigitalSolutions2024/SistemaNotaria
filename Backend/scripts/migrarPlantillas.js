'use strict';
/**
 * migrarPlantillas.js
 *
 * Script de migración: procesa cada .docx en Backend/Plantillas/,
 * inyecta automáticamente los {{PLACEHOLDERS}} en el pie de página
 * y en la Sección VI de Registro, y guarda el resultado en
 * Backend/PlantillasTemplate/ (los originales NO se modifican).
 *
 * Uso:
 *   node Backend/scripts/migrarPlantillas.js
 *
 * Volver a ejecutar es seguro: sobreescribe PlantillasTemplate/ con
 * una versión actualizada si los patrones cambian.
 */

const fs   = require('fs');
const path = require('path');
const { injectPlaceholders, getAllText, transformXmlContent, INJECTION_RULES } = require('../services/docxTransformer');
const PizZip = require('pizzip');

const SRC_DIR  = path.join(__dirname, '..', 'Plantillas');
const DEST_DIR = path.join(__dirname, '..', 'PlantillasTemplate');

// ─────────────────────────────────────────────────────────────
// Verificador: extrae el texto de los párrafos modificados
// en la plantilla generada para confirmar el resultado.
// ─────────────────────────────────────────────────────────────
function verificarResultado(buffer) {
  const zip = new PizZip(buffer);
  const resultados = [];

  const targets = ['word/document.xml', 'word/footer2.xml'];
  for (const t of targets) {
    if (!zip.files[t]) continue;
    const xml = zip.files[t].asText();
    const parrafos = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
    for (const p of parrafos) {
      const txt = getAllText(p);
      if (/\{\{NUM_TRAMITE\}\}|\{\{INICIALES\}\}|\{\{LIBRO_LETRAS\}\}/.test(txt)) {
        resultados.push(`    [${t}] → ${txt.substring(0, 120).trim()}`);
      }
    }
  }
  return resultados;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR);
    console.log(`📁 Creado directorio: PlantillasTemplate/\n`);
  }

  const archivos = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.docx'));

  if (archivos.length === 0) {
    console.error('❌ No se encontraron archivos .docx en Backend/Plantillas/');
    process.exit(1);
  }

  console.log(`\n🔧 Migración de plantillas Word\n`);
  console.log(`   Origen:  Backend/Plantillas/        (${archivos.length} archivos)`);
  console.log(`   Destino: Backend/PlantillasTemplate/\n`);
  console.log('─'.repeat(60));

  let ok = 0, errores = 0;

  for (const archivo of archivos) {
    console.log(`\n📄 ${archivo}`);

    try {
      const srcPath  = path.join(SRC_DIR, archivo);
      const destPath = path.join(DEST_DIR, archivo);

      const srcBuffer = fs.readFileSync(srcPath);
      const { buffer: destBuffer, report } = injectPlaceholders(srcBuffer);

      if (report.modified.length === 0) {
        console.log(`   ⚠️  Sin cambios — el documento ya tiene placeholders o no hay patrones que coincidan.`);
      } else {
        report.modified.forEach(t => console.log(`   ✅ ${t}: placeholders inyectados`));
      }

      // Verificación visual del resultado
      const verificacion = verificarResultado(destBuffer);
      if (verificacion.length > 0) {
        console.log(`   📋 Texto resultante:`);
        verificacion.forEach(l => console.log(l));
      }

      fs.writeFileSync(destPath, destBuffer);
      console.log(`   💾 Guardado en PlantillasTemplate/${archivo}`);
      ok++;
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      errores++;
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`\n✅ Migración completada: ${ok} exitosos, ${errores} con error.\n`);
  console.log(`El servidor usará automáticamente las plantillas en PlantillasTemplate/`);
  console.log(`cuando existan; si no, cae al original en Plantillas/.\n`);
}

main();
