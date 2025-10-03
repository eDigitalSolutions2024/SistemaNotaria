import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// ====== Config ======
const INACTIVITY_MS = 60 * 60 * 1000; // 1 hora
const LS_TOKEN_KEY = 'token';
const LS_USER_KEY = 'user';
const LS_LAST_ACTIVITY = 'lastActivity';

// ====== Helpers ======
function b64urlDecode(str) {
  try {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    return atob(s + pad);
  } catch { return ''; }
}

function getJwtExpMs(token) {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(b64urlDecode(payload));
    if (json?.exp) return json.exp * 1000; // ms
  } catch {}
  return null;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user,  setUser]  = useState(null);

  const isAuthenticated = !!token;
  const role = user?.role || 'user';

  // refs para timers / limpieza
  const idleTimerRef = useRef(null);
  const expTimerRef  = useRef(null);
  const listenersOn  = useRef(false);
  const axios401Interceptor = useRef(null);

  // ============ Idle handling ============
  const clearIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const scheduleIdleTimer = (fromTs = Date.now()) => {
    clearIdleTimer();
    const last = Number(localStorage.getItem(LS_LAST_ACTIVITY) || fromTs);
    const elapsed = Math.max(0, Date.now() - last);
    const remaining = Math.max(0, INACTIVITY_MS - elapsed);

    if (remaining === 0) {
      logout();
      return;
    }
    idleTimerRef.current = setTimeout(() => logout(), remaining);
  };

  const markActivity = () => {
    const now = Date.now();
    // Guarda en localStorage para sincronizar entre pestañas
    localStorage.setItem(LS_LAST_ACTIVITY, String(now));
    scheduleIdleTimer(now);
  };

  const addActivityListeners = () => {
    if (listenersOn.current) return;
    const events = ['click','mousemove','keydown','scroll','touchstart','visibilitychange'];
    events.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }));
    // sincroniza actividad entre pestañas
    window.addEventListener('storage', (e) => {
      if (e.key === LS_LAST_ACTIVITY && e.newValue) {
        scheduleIdleTimer(Number(e.newValue));
      }
    });
    // inicializa marca si no existe
    if (!localStorage.getItem(LS_LAST_ACTIVITY)) {
      localStorage.setItem(LS_LAST_ACTIVITY, String(Date.now()));
    }
    scheduleIdleTimer(); // arranca el timer actual
    listenersOn.current = true;
  };

  const removeActivityListeners = () => {
    if (!listenersOn.current) return;
    const events = ['click','mousemove','keydown','scroll','touchstart','visibilitychange'];
    events.forEach(ev => window.removeEventListener(ev, markActivity));
    listenersOn.current = false;
    clearIdleTimer();
  };

  // ============ JWT expiry handling ============
  const clearExpTimer = () => {
    if (expTimerRef.current) {
      clearTimeout(expTimerRef.current);
      expTimerRef.current = null;
    }
  };

  const scheduleJwtExpiryTimer = (tkn) => {
    clearExpTimer();
    const expMs = getJwtExpMs(tkn);
    if (!expMs) return; // sin exp en el token
    const delay = Math.max(0, expMs - Date.now());
    expTimerRef.current = setTimeout(() => logout(), delay);
  };

  // ============ Axios 401 handling ============
  const attachAxios401Interceptor = () => {
    if (axios401Interceptor.current != null) return;
    axios401Interceptor.current = axios.interceptors.response.use(
      r => r,
      err => {
        if (err?.response?.status === 401) {
          // token inválido/expirado en backend → cerrar sesión aquí
          logout();
        }
        return Promise.reject(err);
      }
    );
  };

  const ejectAxios401Interceptor = () => {
    if (axios401Interceptor.current != null) {
      axios.interceptors.response.eject(axios401Interceptor.current);
      axios401Interceptor.current = null;
    }
  };

  // ============ Restaurar sesión ============
  useEffect(() => {
    const t = localStorage.getItem(LS_TOKEN_KEY);
    const u = localStorage.getItem(LS_USER_KEY);
    if (t) {
      setToken(t);
      axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
      scheduleJwtExpiryTimer(t);
      attachAxios401Interceptor();
    }
    if (u) {
      try { setUser(JSON.parse(u)); } catch {}
    }
  }, []);

  // Arranca / detiene listeners de inactividad según estado
  useEffect(() => {
    if (isAuthenticated) {
      addActivityListeners();
    } else {
      removeActivityListeners();
      clearExpTimer();
      ejectAxios401Interceptor();
      // Limpia marca para no interferir si vuelve a loguearse otro usuario
      localStorage.removeItem(LS_LAST_ACTIVITY);
    }
    // cleanup al desmontar
    return () => {
      removeActivityListeners();
      clearExpTimer();
      ejectAxios401Interceptor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ============ API pública del contexto ============
  const login = ({ token: t, user: u }) => {
    setToken(t);
    setUser(u);
    localStorage.setItem(LS_TOKEN_KEY, t);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(u));
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;

    // Timers y listeners
    scheduleJwtExpiryTimer(t);
    attachAxios401Interceptor();
    markActivity(); // resetea inactividad al iniciar sesión
  };

  const logout = () => {
    // opcional: avisar backend
    // axios.post('/api/auth/logout').catch(() => {});
    setToken(null);
    setUser(null);
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
    delete axios.defaults.headers.common['Authorization'];

    removeActivityListeners();
    clearExpTimer();
    ejectAxios401Interceptor();

    // si quieres, forzar recarga / redirección:
    // window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, user, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
