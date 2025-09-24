import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user,  setUser]  = useState(null);

  const isAuthenticated = !!token;
  const role = user?.role || 'user';

  // Restaura sesión si hay token guardado
  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (t) {
      setToken(t);
      axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    }
    if (u) {
      try { setUser(JSON.parse(u)); } catch { /* ignore */ }
    }
  }, []);

  // Llamas a esto desde Login.jsx cuando el backend responde
  const login = ({ token: t, user: u }) => {
    setToken(t);
    setUser(u);
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
  };

  // Cerrar sesión
  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    // si quieres, fuerza recarga:
    // window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, user, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
