// routes/manual.js
// Manual de usuario de TODO el sistema — botón flotante visible en
// cualquier pantalla (ver frontend/src/components/ManualFlotante.jsx).
// Mismo patrón HTML→Puppeteer que routes/pld.js usa para el manual del
// módulo PLD, pero aquí expone también el HTML crudo (GET /html) para que
// el frontend lo muestre embebido en un iframe como vista previa, sin
// tener que renderizar un PDF solo para previsualizar.
const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const { generarHTMLManualSistema } = require('../pdf-templates/manualSistema');

// GET /api/manual/html — el HTML crudo del manual, para la vista previa
// embebida del botón flotante (un <iframe srcDoc="..."> en el frontend).
router.get('/html', (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(generarHTMLManualSistema());
  } catch (err) {
    console.error('[manual/html]', err);
    res.status(500).json({ mensaje: 'No se pudo generar el manual.' });
  }
});

// GET /api/manual/pdf — el mismo contenido, convertido a PDF con
// Puppeteer. Content-Disposition "inline" a propósito (igual que
// /api/pld/manual): un clic lo abre en vista previa del navegador con su
// botón de descarga/imprimir ya integrado.
router.get('/pdf', async (req, res) => {
  let browser;
  try {
    const html = generarHTMLManualSistema();

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Fuerza el CSS de @media print — el HTML también trae un bloque
    // @media screen (para la vista previa en el botón flotante) que no
    // debe aplicarse aquí, sin depender del default de Puppeteer.
    await page.emulateMediaType('print');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '25mm', right: '25mm', bottom: '25mm', left: '25mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%; font-size:8px; color:#94a3b8; text-align:center;
                    font-family: Arial, sans-serif; padding-bottom: 10mm;">
          Página <span class="pageNumber"></span> de <span class="totalPages"></span>
        </div>`,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="manual-sistema-notaria17.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[manual/pdf]', err);
    return res.status(500).json({ mensaje: 'No se pudo generar el manual en PDF.' });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

module.exports = router;
