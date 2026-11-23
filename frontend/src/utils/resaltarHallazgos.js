// Subraya en amarillo (<mark>) las citas de los hallazgos de la IA dentro de la
// vista previa del .docx ya renderizada (docx-preview). Solo toca el DOM de la
// vista previa; nunca el archivo real.

const CLASE = 'poder-hallazgo';

function normChar(c) {
  if (/\s/.test(c)) return ' ';
  if (/[“”«»„"]/.test(c)) return '"';
  if (/[‘’´`']/.test(c)) return "'";
  if (/[–—−]/.test(c)) return '-';
  return c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Texto normalizado del contenedor + mapa de cada carácter normalizado a su
// (nodo de texto, posición) original.
function construirMapa(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let texto = '';
  const mapa = [];
  let ultimoEspacio = true;
  let node;
  while ((node = walker.nextNode())) {
    const t = node.nodeValue || '';
    for (let i = 0; i < t.length; i++) {
      const n = normChar(t[i]);
      if (!n) continue;
      if (n === ' ') {
        if (ultimoEspacio) continue;
        ultimoEspacio = true;
      } else {
        ultimoEspacio = false;
      }
      texto += n;
      mapa.push({ node, offset: i });
    }
  }
  return { texto, mapa };
}

function normalizarCita(cita) {
  let out = '';
  let ultimoEspacio = true;
  for (const c of String(cita || '')) {
    const n = normChar(c);
    if (!n) continue;
    if (n === ' ') {
      if (ultimoEspacio) continue;
      ultimoEspacio = true;
    } else {
      ultimoEspacio = false;
    }
    out += n;
  }
  return out.trim();
}

function envolver(inicio, fin, mapa, idx) {
  // Agrupa por nodo de texto: [min offset, max offset + 1]
  const grupos = new Map();
  for (let k = inicio; k < fin; k++) {
    const { node, offset } = mapa[k];
    const g = grupos.get(node);
    if (!g) grupos.set(node, [offset, offset + 1]);
    else g[1] = offset + 1;
  }
  for (const [node, [ini, fn]] of grupos) {
    if (!node.parentNode) continue;
    let objetivo = node;
    if (fn < objetivo.nodeValue.length) objetivo.splitText(fn);
    if (ini > 0) objetivo = objetivo.splitText(ini);
    if (!objetivo.nodeValue.trim()) continue;
    const mark = document.createElement('mark');
    mark.className = CLASE;
    mark.dataset.hallazgo = String(idx);
    mark.style.cssText = 'background:#ffe14d;color:inherit;padding:0;border-radius:2px;box-shadow:0 0 0 1px #e0b800;';
    objetivo.parentNode.insertBefore(mark, objetivo);
    mark.appendChild(objetivo);
  }
}

function buscar(textoNorm, cita) {
  if (!cita) return null;
  let i = textoNorm.indexOf(cita);
  if (i >= 0) return [i, i + cita.length];
  // Respaldo: la IA a veces cambia una palabra al final; prueba con el inicio
  // y con el final de la cita.
  const palabras = cita.split(' ');
  if (palabras.length >= 6) {
    const ini = palabras.slice(0, Math.ceil(palabras.length * 0.6)).join(' ');
    i = textoNorm.indexOf(ini);
    if (i >= 0) return [i, i + ini.length];
    const fin = palabras.slice(Math.floor(palabras.length * 0.4)).join(' ');
    i = textoNorm.indexOf(fin);
    if (i >= 0) return [i, i + fin.length];
  }
  return null;
}

/**
 * Quita subrayados previos y marca la cita de cada hallazgo.
 * @returns {boolean[]} por hallazgo: true si se localizó en el documento.
 */
export function resaltarHallazgos(container, hallazgos) {
  if (!container) return [];
  quitarResaltado(container);
  const lista = Array.isArray(hallazgos) ? hallazgos : [];
  return lista.map((h, idx) => {
    const cita = normalizarCita(h?.cita);
    if (!cita) return false;
    const { texto, mapa } = construirMapa(container);
    const pos = buscar(texto, cita);
    if (!pos) return false;
    envolver(pos[0], pos[1], mapa, idx);
    return true;
  });
}

export function quitarResaltado(container) {
  if (!container) return;
  container.querySelectorAll(`mark.${CLASE}`).forEach((m) => {
    const padre = m.parentNode;
    if (!padre) return;
    while (m.firstChild) padre.insertBefore(m.firstChild, m);
    padre.removeChild(m);
    padre.normalize();
  });
}

/** Lleva la vista previa al hallazgo idx y lo hace parpadear. */
export function irAHallazgo(container, idx) {
  if (!container) return;
  const marks = container.querySelectorAll(`mark.${CLASE}[data-hallazgo="${idx}"]`);
  if (!marks.length) return;
  marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  marks.forEach((m) => {
    m.animate(
      [{ background: '#ff9800' }, { background: '#ffe14d' }],
      { duration: 1200, iterations: 2 }
    );
  });
}
