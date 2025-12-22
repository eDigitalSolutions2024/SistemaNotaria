// src/auth/sessionWatcher.js
const SESSION_MAX_AGE = 60*60*1000; // 10 segundos para pruebas

function touchActivity() {
  localStorage.setItem('lastActivity', String(Date.now()));
}

export function setupActivityListeners() {
  const handler = () => touchActivity();

  window.addEventListener('click', handler);
  window.addEventListener('keydown', handler);
  window.addEventListener('mousemove', handler);

  // inicializa al cargar
  touchActivity();

  return () => {
    window.removeEventListener('click', handler);
    window.removeEventListener('keydown', handler);
    window.removeEventListener('mousemove', handler);
  };
}

export function startInactivityWatcher(onLogout) {
  const id = setInterval(() => {
    const raw = localStorage.getItem('lastActivity');
    const last = raw ? Number(raw) : 0;
    if (!last) return;

    const diff = Date.now() - last;

    // para debug
    // console.log('diff ms:', diff);

    if (diff > SESSION_MAX_AGE) {
      clearInterval(id);
      onLogout();
    }
  }, 1000); // revisa cada 1s

  return () => clearInterval(id);
}
