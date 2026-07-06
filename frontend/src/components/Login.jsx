// src/components/Login.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../auth/AuthContext';

const logo = '/logo.png';
const API  = process.env.REACT_APP_API_URL || 'http://localhost:8010';

export default function Login() {
  const { login } = useAuth();
  const [user,     setUser]     = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState(null);

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
        user: user.trim(),
        password,
      });

      if (!data?.token || !data?.user) throw new Error('Respuesta inválida del servidor');
      login({ token: data.token, user: data.user });
    } catch (err) {
      const t =
        err.response?.data?.mensaje ||
        err.response?.data?.error  ||
        err.message                 ||
        'No se pudo iniciar sesión';
      setMsg({ type: 'error', text: t });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <form onSubmit={onSubmit} style={styles.card}>

        {/* Logo */}
        <div style={styles.logoWrap}>
          <img src={logo} alt="Notaría 17" style={styles.logo} />
        </div>

        {/* Branding */}
        <div style={styles.brandBlock}>
          <div style={styles.brandTitle}>Notaría Pública No. 17</div>
          <div style={styles.brandSub}>Ciudad Juárez, Chihuahua</div>
        </div>

        <hr style={styles.divider} />

        <p style={styles.formLabel}>Iniciar sesión</p>

        <input
          autoFocus
          type="text"
          placeholder="Usuario (código / nombre / ID)"
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
            onClick={() => setShowPwd((s) => !s)}
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
              marginTop: 4,
              padding: '9px 12px',
              borderRadius: 8,
              fontSize: 13,
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
    background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #1e40af 100%)',
    padding: 16,
  },
  card: {
    width: 420,
    maxWidth: '92vw',
    background: '#fff',
    border: 'none',
    borderRadius: 18,
    padding: '32px 28px 28px',
    boxShadow: '0 24px 56px rgba(0, 0, 0, 0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logo: {
    height: 90,
    width: 90,
    objectFit: 'contain',
  },
  brandBlock: {
    textAlign: 'center',
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#1e293b',
    letterSpacing: 0.3,
  },
  brandSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #e2e8f0',
    margin: '2px 0',
  },
  formLabel: {
    margin: '0 0 2px',
    fontSize: 13,
    fontWeight: 600,
    color: '#475569',
  },
  input: {
    width: '100%',
    height: 42,
    padding: '0 12px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    outline: 'none',
    fontSize: 14,
    color: '#1e293b',
    boxSizing: 'border-box',
    fontFamily: "'Segoe UI', sans-serif",
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
    fontSize: 17,
  },
  submit: {
    marginTop: 4,
    height: 44,
    border: 'none',
    borderRadius: 10,
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    letterSpacing: 0.3,
    transition: 'background 0.2s',
    fontFamily: "'Segoe UI', sans-serif",
  },
};
