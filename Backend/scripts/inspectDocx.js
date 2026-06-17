'use strict';
// Extrae y muestra el XML real de los párrafos relevantes del template original
const PizZip = require('pizzip');
const fs     = require('fs');
const path   = require('path');

const file = path.join(__dirname, '..', 'Plantillas', 'PPCAAAD Lim Inm Revocable en Acta El a El 202509.docx');
const buf  = fs.readFileSync(file);
const zip  = new PizZip(buf);

function getText(pXml) {
  return (pXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) ?? [])
    .map(t => t.replace(/<[^>]+>/g, '')).join('');
}

const docXml   = zip.files['word/document.xml'].asText();
const parrafos = docXml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];

const keywords = ['bajo el n', 'Cd. Ju', 'Acta No.'];

for (const pXml of parrafos) {
  const txt = getText(pXml);
  const matched = keywords.some(k => txt.toLowerCase().includes(k.toLowerCase()));
  if (!matched) continue;

  console.log('='.repeat(70));
  console.log('TEXTO VISIBLE:', txt.trim().slice(0, 120));
  console.log('');

  // Mostrar cada run con su contenido
  const runs = pXml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? [];
  runs.forEach((r, i) => {
    const hasBr   = /<w:br\b/.test(r);
    const hasTab  = /<w:tab\b/.test(r);
    const tMatch  = r.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g);
    const texts   = tMatch ? tMatch.map(t => t.replace(/<[^>]+>/g,'')).join('') : '';
    const isBold  = /<w:b(?:\s|\/|>)/.test(r);
    const isItal  = /<w:i(?:\s|\/|>)/.test(r);
    const fmt     = [isBold?'BOLD':'', isItal?'ITAL':'', hasBr?'BR':'', hasTab?'TAB':''].filter(Boolean).join('+');

    console.log(`  run[${i}] [${fmt || 'plain'}] "${texts}"${hasBr?' <SALTO>':''}${hasTab?' <TAB>':''}`);
  });
  console.log('');
}
