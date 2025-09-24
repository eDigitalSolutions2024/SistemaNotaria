// src/components/Login.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth/AuthContext';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8020';

export default function Login() {
  const { login } = useAuth(); // del AuthContext: guarda token+user y marca autenticado
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);

    if (!user.trim() || !password) {
      setMsg({ type: 'warn', text: 'Ingresa usuario y contraseña.' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/login`, {
        user: user.trim(),           // puede ser _id, código, nombre, etc.
        password,
      });

      // data: { token, user: {...} }
      if (!data?.token || !data?.user) {
        throw new Error('Respuesta inválida del servidor');
      }

      // Persiste sesión en el contexto (y localStorage dentro del contexto)
      login({ token: data.token, user: data.user });

      // No hacemos redirect aquí; App/Router mostrará la MainPage al estar logueado
    } catch (err) {
      const t =
        err.response?.data?.mensaje ||
        err.response?.data?.error ||
        err.message ||
        'No se pudo iniciar sesión';
      setMsg({ type: 'error', text: t });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <form onSubmit={onSubmit} style={styles.card}>
        <h2 style={{ margin: 0, marginBottom: 16 }}>Iniciar sesión</h2>

        <input
          autoFocus
          type="text"
          placeholder="Usuario (código/nombre/_id...)"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          style={styles.input}
          disabled={loading}
        />

        <div style={{ position: 'relative' }}>
          <input
            type={showPwd ? 'text' : 'password'}
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPwd(s => !s)}
            style={styles.eyeBtn}
            tabIndex={-1}
          >
            {showPwd ? '🙈' : '👁️'}
          </button>
        </div>

        <button type="submit" style={styles.submit} disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        {msg && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 14,
              background:
                msg.type === 'error' ? '#ffe8e8' :
                msg.type === 'warn'  ? '#fff7e0' : '#e8fff1',
              border:
                msg.type === 'error' ? '1px solid #e57373' :
                msg.type === 'warn'  ? '1px solid #f2c200' : '1px solid #62c28e',
              color:
                msg.type === 'error' ? '#b4232c' :
                msg.type === 'warn'  ? '#8a6d00' : '#1b5e20',
            }}
          >
            {msg.text}
          </div>
        )}
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f6f7fb',
    padding: 16,
  },
  card: {
    width: 420,
    maxWidth: '92vw',
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 12px 24px rgba(0,0,0,.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    width: '100%',
    height: 42,
    padding: '0 12px',
    border: '1px solid #d9d9d9',
    borderRadius: 8,
    outline: 'none',
    fontSize: 15,
  },
  eyeBtn: {
    position: 'absolute',
    right: 8,
    top: 8,
    height: 26,
    width: 32,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 18,
  },
  submit: {
    marginTop: 6,
    height: 44,
    border: 'none',
    borderRadius: 10,
    background: '#0b66ff',
    color: '#fff',
    fontWeight: 600,
    fontSize: 16,
    cursor: 'pointer',
  },
};
