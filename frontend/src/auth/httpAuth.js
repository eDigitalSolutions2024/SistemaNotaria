// src/auth/httpAuth.js
// Puente entre instancias de axios sueltas (axios.create()) y el logout real
// de AuthContext. Un axios.create() NO hereda los interceptores del axios
// global, así que un 401 en una de esas instancias nunca disparaba el
// logout — el usuario se quedaba "dentro" del sistema con un token muerto.
let logoutHandler = null;

export function setAuthLogoutHandler(fn) {
  logoutHandler = fn;
}

export function triggerAuthLogout() {
  if (logoutHandler) logoutHandler();
}

// Pega a cualquier instancia de axios (global o axios.create()) el mismo
// comportamiento: 401 del backend -> cierra sesión y el Gate de App.js
// manda solo a Login (no hace falta recargar la página).
export function attachAuthInterceptor(axiosInstance) {
  axiosInstance.interceptors.response.use(
    (r) => r,
    (err) => {
      if (err?.response?.status === 401) {
        triggerAuthLogout();
      }
      return Promise.reject(err);
    }
  );
}
