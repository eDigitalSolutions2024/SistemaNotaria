'use strict';
const PizZip = require('pizzip');
const fs     = require('fs');
const path   = require('path');

const file = path.join(__dirname, 'test_tramite8.docx');
const buf  = fs.readFileSync(file);
const zip  = new PizZip(buf);
const xml  = zip.files['word/document.xml'].asText();
const paras = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];

const KEYWORDS = ['bajo el n', 'el día', 'del mes de'];

for (const p of paras) {
  const txt = (p.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) ?? [])
    .map(t => t.replace(/<[^>]+>/g, ''))
    .join('');
  if (!KEYWORDS.some(k => txt.includes(k))) continue;

  console.log('TEXTO VISIBLE:', txt.slice(0, 200));
  console.log('');

  const runs = p.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? [];
  runs.forEach((r, i) => {
    const t = (r.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/) ?? [])[1] ?? '';
    if (!t) return;
    const boldOn  = r.includes('<w:b/>') || r.includes('<w:b ');
    const boldOff = r.includes('w:val="0"');
    const bold    = boldOn && !boldOff;
    console.log('  run[' + i + '] [' + (bold ? 'BOLD ' : 'plain') + '] ' + JSON.stringify(t));
  });
}
