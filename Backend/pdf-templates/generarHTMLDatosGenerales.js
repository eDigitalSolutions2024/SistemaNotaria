// pdf-templates/generarHTMLDatosGenerales.js
const fs = require('fs');
const path = require('path');

// Pequeño helper para escapar caracteres especiales en HTML
function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper para formatear fecha (puedes luego cambiar el formato)
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

/**
 * Recibe el objeto pdfData (de la ruta /pdf-data/:clienteId)
 * y devuelve un string HTML listo para que Puppeteer lo convierta en PDF.
 */
function generarHTMLDatosGenerales(pdfData) {
  const templatePath = path.join(__dirname, 'datosGenerales.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  const { notaria, cliente, generales, generadoEl } = pdfData;

  // 🔹 Cargar logo en base64
  let logoSrc = '';
  try {
    const logoPath = path.join(__dirname, 'asstes', 'logo.png'); // ajusta el nombre si usas otro
    if (fs.existsSync(logoPath)) {
      const imageBuffer = fs.readFileSync(logoPath);
      const base64Image = imageBuffer.toString('base64');
      // si tu logo es JPG, cambia image/png por image/jpeg
      logoSrc = `data:image/png;base64,${base64Image}`;
    }
  } catch (e) {
    console.error('No se pudo cargar el logo de la notaría:', e.message);
  }

  // 1) Armar texto de "tiene cita"
  const tieneCitaTexto = cliente.tieneCita ? 'Sí' : 'No';

  // 2) Bloques de personas
  const personas = generales?.personas || [];
  const personasHTML = personas
    .map((persona) => {
      return `
      <article class="persona-block">
        <h4 class="persona-titulo">Persona ${persona.indice}</h4>
        <table class="info-table persona-table">
          <tbody>
            <tr>
              <th>Nombre completo</th>
              <td>${escapeHtml(persona.nombre_completo)}</td>
            </tr>
            <tr>
              <th>Lugar de nacimiento</th>
              <td>${escapeHtml(persona.lugar_nacimiento)}</td>
            </tr>
            <tr>
              <th>Fecha de nacimiento</th>
              <td>${formatDate(persona.fecha_nacimiento)}</td>
            </tr>
            <tr>
              <th>Ocupación</th>
              <td>${escapeHtml(persona.ocupacion)}</td>
            </tr>
            <tr>
              <th>Estado civil</th>
              <td>${escapeHtml(persona.estado_civil)}</td>
            </tr>
            <tr>
              <th>Domicilio</th>
              <td>${escapeHtml(persona.domicilio)}</td>
            </tr>
            <tr>
              <th>Colonia</th>
              <td>${escapeHtml(persona.colonia)}</td>
            </tr>
            <tr>
              <th>Teléfono principal</th>
              <td>${escapeHtml(persona.telefono_principal)}</td>
            </tr>
            <tr>
              <th>Teléfono secundario</th>
              <td>${escapeHtml(persona.telefono_secundario || '')}</td>
            </tr>
            <tr>
              <th>Correo electrónico</th>
              <td>${escapeHtml(persona.correo_electronico)}</td>
            </tr>
            <tr>
              <th>CURP</th>
              <td>${escapeHtml(persona.curp)}</td>
            </tr>
            <tr>
              <th>RFC</th>
              <td>${escapeHtml(persona.rfc)}</td>
            </tr>
          </tbody>
        </table>
      </article>
      `;
    })
    .join('\n');

  // 3) Reemplazos básicos de placeholders
  html = html
    .replace('{{notaria.nombre}}', escapeHtml(notaria.nombre || ''))
    .replace('{{notaria.direccion}}', escapeHtml(notaria.direccion || ''))
    .replace('{{notaria.telefono}}', escapeHtml(notaria.telefono || ''))
    .replace('{{generadoEl}}', formatDate(generadoEl))

    .replace('{{cliente.id}}', escapeHtml(cliente.id))
    .replace('{{cliente.nombre}}', escapeHtml(cliente.nombre || ''))
    .replace('{{cliente.numero_telefono}}', escapeHtml(cliente.numero_telefono || ''))
    .replace('{{cliente.estado}}', escapeHtml(cliente.estado || ''))
    .replace('{{cliente.servicio}}', escapeHtml(cliente.servicio || ''))
    .replace('{{cliente.tieneCitaTexto}}', tieneCitaTexto)
    .replace('{{cliente.hora_llegada}}', formatDate(cliente.hora_llegada))

    .replace('{{generales.fechaRegistro}}', formatDate(generales.fechaRegistro))

    .replace('{{PERSONAS_BLOQUES}}', personasHTML)
    .replace('{{LOGO_SRC}}', logoSrc || '');

  return html;
}

module.exports = generarHTMLDatosGenerales;
