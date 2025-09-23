// src/components/Login.jsx
import { useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function Login() {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      const { data } = await axios.post(`${API}/auth/login`, { user, password });
      localStorage.setItem('token', data.token);
      axios.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      setMsg({ type: 'ok', text: `Bienvenido, ${data.user?.nombre}` });
      // redirige a tu dashboard…
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.mensaje || 'Error' });
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 360, margin: '40px auto' }}>
      <h3>Iniciar sesión</h3>
      <input placeholder="Usuario (código/nombre/_id…)" value={user} onChange={e=>setUser(e.target.value)} />
      <input type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} />
      <button type="submit">Entrar</button>
      {msg && <div style={{ marginTop: 8 }}>{msg.text}</div>}
    </form>
  );
}
