// frontend/src/components/anuncios/AnunciosAdmin.jsx
// Panel de ADMIN: redactar y enviar un anuncio manual a todos los usuarios
// (en vivo vía Socket.io) y consultar el historial con quién ya lo vio.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  TextField, Button, MenuItem, Select, FormControl,
  Chip, CircularProgress, ToggleButtonGroup, ToggleButton, Checkbox, ListItemText, OutlinedInput,
} from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { fmtFechaHora, ROLES } from './anunciosConstants';
import './anuncios.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010/api';

export default function AnunciosAdmin() {
  const { token } = useAuth();
  const authCfg = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [urgencia, setUrgencia] = useState('NORMAL');
  const [alcance, setAlcance] = useState('TODOS');
  const [rolesElegidos, setRolesElegidos] = useState([]);
  const [usuariosElegidos, setUsuariosElegidos] = useState([]); // ids
  const [abogados, setAbogados] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [expandidoId, setExpandidoId] = useState(null);

  useEffect(() => {
    axios.get(`${API}/abogados`, authCfg)
      .then(({ data }) => setAbogados(Array.isArray(data) ? data : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const cargarHistorial = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await axios.get(`${API}/anuncios`, authCfg);
      setHistorial(data?.data?.items || []);
    } catch {
      // deja el historial como estaba
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (!titulo.trim() || !mensaje.trim()) {
      setError('Título y mensaje son obligatorios.');
      return;
    }
    if (alcance === 'SEGMENTO' && !rolesElegidos.length && !usuariosElegidos.length) {
      setError('Elige al menos un rol o un usuario para un anuncio segmentado.');
      return;
    }
    setEnviando(true);
    try {
      await axios.post(`${API}/anuncios`, {
        titulo,
        mensaje,
        urgencia,
        alcance,
        destinatarioRoles: alcance === 'SEGMENTO' ? rolesElegidos : [],
        destinatarioIds: alcance === 'SEGMENTO' ? usuariosElegidos : [],
      }, authCfg);
      setTitulo('');
      setMensaje('');
      setUrgencia('NORMAL');
      setAlcance('TODOS');
      setRolesElegidos([]);
      setUsuariosElegidos([]);
      cargarHistorial();
    } catch (err) {
      setError(err?.response?.data?.msg || 'Error enviando el anuncio.');
    } finally {
      setEnviando(false);
    }
  };

  const desactivar = async (id) => {
    try {
      await axios.patch(`${API}/anuncios/${id}/desactivar`, {}, authCfg);
      cargarHistorial();
    } catch {
      // silencioso
    }
  };

  return (
    <div className="anuncios-admin">
      <h2>Anuncios</h2>

      <form className="anuncios-form" onSubmit={enviar}>
        <div className="anuncios-form-grid">
          <div className="anuncios-form-fields">
            <TextField
              label="Título"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label="Mensaje"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              fullWidth
              multiline
              minRows={6}
              size="small"
            />
          </div>

          <div className="anuncios-form-options">
            <div className="anuncios-field">
              <span className="anuncios-field-label">Urgencia</span>
              <FormControl size="small" fullWidth>
                <Select
                  value={urgencia}
                  onChange={(e) => setUrgencia(e.target.value)}
                >
                  <MenuItem value="NORMAL">Normal (aviso, no bloquea)</MenuItem>
                  <MenuItem value="URGENTE">Urgente (ventana bloqueante)</MenuItem>
                </Select>
              </FormControl>
            </div>

            <div className="anuncios-field">
              <span className="anuncios-field-label">Destinatarios</span>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={alcance}
                onChange={(_e, v) => v && setAlcance(v)}
              >
                <ToggleButton value="TODOS">Todos</ToggleButton>
                <ToggleButton value="SEGMENTO">Específicos</ToggleButton>
              </ToggleButtonGroup>
            </div>
          </div>
        </div>

        {alcance === 'SEGMENTO' && (
          <div className="anuncios-segmento-box">
            <div className="anuncios-segmento-title">¿A quién va dirigido este anuncio?</div>
            <div className="anuncios-segmento-hint">
              Llega a quien cumpla al menos una condición: estar en un rol elegido o ser uno de los usuarios elegidos.
            </div>
            <div className="anuncios-form-row">
              <div className="anuncios-field anuncios-field-grow">
                <span className="anuncios-field-label">Por rol</span>
                <FormControl size="small" fullWidth>
                  <Select
                    multiple
                    displayEmpty
                    value={rolesElegidos}
                    onChange={(e) => setRolesElegidos(e.target.value)}
                    input={<OutlinedInput />}
                    renderValue={(selected) => selected.join(', ') || 'Ningún rol'}
                  >
                    {ROLES.map((r) => (
                      <MenuItem key={r} value={r}>
                        <Checkbox checked={rolesElegidos.includes(r)} size="small" />
                        <ListItemText primary={r} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>

              <div className="anuncios-field anuncios-field-grow">
                <span className="anuncios-field-label">Usuarios específicos</span>
                <FormControl size="small" fullWidth>
                  <Select
                    multiple
                    displayEmpty
                    value={usuariosElegidos}
                    onChange={(e) => setUsuariosElegidos(e.target.value)}
                    input={<OutlinedInput />}
                    renderValue={(selected) => {
                      const nombres = abogados.filter((a) => selected.includes(a._id)).map((a) => a.nombre);
                      return nombres.join(', ') || 'Ningún usuario';
                    }}
                  >
                    {abogados.map((a) => (
                      <MenuItem key={a._id} value={a._id}>
                        <Checkbox checked={usuariosElegidos.includes(a._id)} size="small" />
                        <ListItemText primary={`${a.nombre} (${a.role})`} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>
            </div>
          </div>
        )}

        <div className="anuncios-form-footer">
          {error && <div className="anuncios-error">{error}</div>}
          <Button type="submit" variant="contained" size="large" disabled={enviando}>
            {enviando ? 'Enviando…' : alcance === 'SEGMENTO' ? 'Enviar a segmento' : 'Enviar a todos'}
          </Button>
        </div>
      </form>

      <div className="anuncios-historial-card">
        <h3 className="anuncios-historial-title">Historial</h3>
        {cargando ? (
          <CircularProgress size={24} />
        ) : historial.length === 0 ? (
          <div className="anuncios-empty">Todavía no se ha enviado ningún anuncio.</div>
        ) : (
          <div className="anuncios-table-wrap">
            <table className="anuncios-table">
              <colgroup>
                <col style={{ width: '10%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Urgencia</th>
                  <th>Dirigido a</th>
                  <th>Enviado por</th>
                  <th>Vistos</th>
                  <th></th>
                </tr>
              </thead>
            <tbody>
              {historial.map((a) => (
                <React.Fragment key={a._id}>
                  <tr>
                    <td>{fmtFechaHora(a.createdAt)}</td>
                    <td>{a.titulo}</td>
                    <td>
                      <Chip
                        size="small"
                        variant={a.tipo === 'AUTOMATICO' ? 'filled' : 'outlined'}
                        color={a.tipo === 'AUTOMATICO' ? 'info' : 'default'}
                        label={a.tipo === 'AUTOMATICO' ? 'Automático' : 'Manual'}
                      />
                    </td>
                    <td>
                      <Chip
                        size="small"
                        label={a.urgencia === 'URGENTE' ? 'Urgente' : 'Normal'}
                        color={a.urgencia === 'URGENTE' ? 'error' : 'default'}
                      />
                      {!a.activo && <Chip size="small" label="Desactivado" sx={{ ml: 1 }} />}
                    </td>
                    <td>
                      {a.alcance !== 'SEGMENTO' ? (
                        'Todos'
                      ) : (
                        <>
                          {(a.destinatarioRoles || []).map((r) => (
                            <Chip key={r} size="small" label={r} sx={{ mr: 0.5, mb: 0.5 }} />
                          ))}
                          {(a.destinatarios || []).map((d) => (
                            <Chip key={d.usuarioId} size="small" variant="outlined" label={d.usuarioNombre} sx={{ mr: 0.5, mb: 0.5 }} />
                          ))}
                        </>
                      )}
                    </td>
                    <td>{a.creadoPorNombre || '—'}</td>
                    <td>
                      <button
                        className="anuncios-vistos-btn"
                        onClick={() => setExpandidoId(expandidoId === a._id ? null : a._id)}
                      >
                        {a.vistoCount} / {a.totalObjetivo}
                      </button>
                    </td>
                    <td>
                      {a.activo && (
                        <button className="anuncios-desactivar-btn" onClick={() => desactivar(a._id)}>
                          Desactivar
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandidoId === a._id && (
                    <tr>
                      <td colSpan={8}>
                        <div className="anuncios-vistos-detalle">
                          {(a.vistoPor || []).length === 0 ? (
                            <span>Nadie lo ha visto todavía.</span>
                          ) : (
                            (a.vistoPor || [])
                              .slice()
                              .sort((x, y) => new Date(x.vistoEn) - new Date(y.vistoEn))
                              .map((v) => (
                                <span key={v.usuarioId} className="anuncios-visto-pill">
                                  {v.usuarioNombre || v.usuarioId} — {fmtFechaHora(v.vistoEn)}
                                </span>
                              ))
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
