'use strict';
const PizZip = require('pizzip');
const fs     = require('fs');
const path   = require('path');

const PLANTILLAS = path.join(__dirname, '..', 'Plantillas');
const archivos   = fs.readdirSync(PLANTILLAS).filter(f => f.endsWith('.docx'));

function getText(pXml) {
  return (pXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) ?? [])
    .map(t => t.replace(/<[^>]+>/g, '')).join('');
}

const KEYWORDS = ['Ciudad Ju', 'el día', 'del mes de', 'del año', 'noviembre', 'octubre', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'diciembre'];

for (const archivo of archivos) {
  const buf  = fs.readFileSync(path.join(PLANTILLAS, archivo));
  const zip  = new PizZip(buf);

  // Buscar en document.xml y también en headers/footers
  const targets = Object.keys(zip.files).filter(k =>
    k.startsWith('word/') && k.endsWith('.xml') &&
    (k.includes('document') || k.includes('header') || k.includes('footer'))
  );

  let found = false;
  for (const target of targets) {
    const docXml  = zip.files[target].asText();
    const parrafos = docXml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];

    for (const pXml of parrafos) {
      const txt = getText(pXml);
      const matched = KEYWORDS.some(k => txt.toLowerCase().includes(k.toLowerCase()));
      if (!matched) continue;
      // Solo mostrar si contiene algo que parezca fecha larga (día + mes + año)
      if (!/día|del mes|del año/i.test(txt)) continue;

      if (!found) {
        console.log('\n' + '='.repeat(70));
        console.log('ARCHIVO:', archivo);
        found = true;
      }
      console.log('-'.repeat(70));
      console.log('FUENTE:', target);
      console.log('TEXTO VISIBLE:', txt.trim().slice(0, 200));
      console.log('');

      const runs = pXml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? [];
      runs.forEach((r, i) => {
        const hasBr  = /<w:br\b/.test(r);
        const hasTab = /<w:tab\b/.test(r);
        const tMatch = r.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g);
        const texts  = tMatch ? tMatch.map(t => t.replace(/<[^>]+>/g, '')).join('') : '';
        const boldOn = r.includes('<w:b/>') || r.includes('<w:b ');
        const boldOff = r.includes('w:val="0"');
        const bold   = boldOn && !boldOff;
        const fmt    = [bold ? 'BOLD' : '', hasBr ? 'BR' : '', hasTab ? 'TAB' : ''].filter(Boolean).join('+');
        console.log(`  run[${i}] [${fmt || 'plain'}] ${JSON.stringify(texts)}${hasBr ? ' <BR>' : ''}${hasTab ? ' <TAB>' : ''}`);
      });
      console.log('');
    }
  }
}
