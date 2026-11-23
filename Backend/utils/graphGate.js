// Backend/utils/graphGate.js
// Control GLOBAL de concurrencia hacia Microsoft Graph.
//
// Outlook solo permite ~4 peticiones simultáneas por buzón (límite
// "MailboxConcurrency"). Todas las llamadas a Graph del calendario pasan por
// aquí; las que reciben 429/503 se reintentan esperando lo que Outlook indique.

const GRAPH_MAX = 3; // deja 1 de margen
let active = 0;
const waiters = [];

function acquire() {
  return new Promise((resolve) => {
    if (active < GRAPH_MAX) {
      active++;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });
}

function release() {
  const next = waiters.shift();
  if (next) next(); // el cupo pasa directo al siguiente en la fila
  else active--;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function graphLimited(fn, attempts = 6) {
  for (let i = 1; ; i++) {
    let wait = 0;
    await acquire();
    try {
      return await fn();
    } catch (e) {
      const st = e.response?.status;
      if ((st !== 429 && st !== 503) || i >= attempts) throw e;
      const ra = Number(e.response?.headers?.["retry-after"]);
      wait = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 700 * i, 8000);
    } finally {
      release(); // se libera el cupo ANTES de esperar el reintento
    }
    await sleep(wait);
  }
}

// ¿Fallo temporal (no cachear / reintentar luego) o permanente (permiso, etc.)?
const isTransient = (e) => {
  const st = e.response?.status;
  return !st || st === 429 || st >= 500;
};

module.exports = { graphLimited, isTransient, sleep };
