// src/components/EscrituraEstatus.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button, TextField } from '@mui/material';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const DOCS_LEFT = [
  ['escriturasAntecedente', 'Escrituras (antecedente)'],
  ['identificacion', 'Identificación'],
  ['curp', 'CURP'],
  ['actaNacimiento', 'Acta de nacimiento'],
  ['actaMatrimonio', 'Acta de matrimonio'],
  ['constSitFiscal', 'Const. Sit. Fiscal'],
  ['planoYAvaluo', 'Plano y avalúo'],
  ['zonificacion', 'Zonificación'],
];

const DOCS_RIGHT = [
  ['predial', 'Predial'],
  ['agua', 'Agua'],
  ['luz', 'Luz'],
  ['poder', 'Poder'],
  ['constanciasJudiciales', 'Constancias judiciales'],
  ['subdivision', 'Subdivisión'],
  ['oficial', 'Oficial'],
  ['otros', 'Otros'],
];

export default function EscrituraEstatus({ escrituraId, onClose }) {
  const [row, setRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const documentos = row?.documentos || {};
  const anticipos = row?.anticipos || {};

  const totals = useMemo(() => {
    const keys = [...DOCS_LEFT, ...DOCS_RIGHT].map(([k]) => k);
    const done = keys.filter((k) => Boolean(documentos?.[k])).length;
    return { total: keys.length, done, pending: keys.length - done };
  }, [documentos]);

  const load = async () => {
    if (!escrituraId) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/escrituras/${escrituraId}`);
      const safe = {
        ...data,
        documentos: data?.documentos || {},
        anticipos: data?.anticipos || { anticipo1: '', anticipo2: '', anticipo3: '' },
        comentariosEstatus: data?.comentariosEstatus || '',
      };
      setRow(safe);
    } catch (e) {
      setRow(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrituraId]);

  const toggleDoc = (key) => {
    setRow((prev) => ({
      ...(prev || {}),
      documentos: { ...((prev?.documentos) || {}), [key]: !prev?.documentos?.[key] },
    }));
  };

  const save = async () => {
    if (!row?._id) return;
    setSaving(true);
    try {
      await axios.put(`${API}/escrituras/${row._id}`, {
        documentos: row.documentos,
        anticipos: row.anticipos,
        comentariosEstatus: row.comentariosEstatus,
      });
      await load();
    } catch (e) {
      // opcional: manejar error con toast/msg externo
    } finally {
      setSaving(false);
    }
  };

  if (!escrituraId) return <div style={{ padding: 16 }}>No hay ID de escritura.</div>;
  if (loading) return <div style={{ padding: 16 }}>Cargando…</div>;
  if (!row) return <div style={{ padding: 16 }}>No se pudo cargar la escritura.</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Estatus — Escritura #{row.numeroControl ?? '—'}</h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outlined" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Datos generales */}
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><b>Fecha:</b> {row.fecha ? String(row.fecha).slice(0, 10) : '—'}</div>
          <div><b>Abogado:</b> {row.abogado || '—'}</div>
          <div><b>Cliente:</b> {row.cliente || '—'}</div>
        </div>

        <div style={{ marginTop: 10 }}>
          <b>Documentación:</b> {totals.done}/{totals.total} · Pendientes: {totals.pending}
        </div>
      </div>

      {/* Documentación */}
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
        <h3 style={{ marginTop: 0 }}>Documentación</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            {DOCS_LEFT.map(([k, label]) => (
              <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                <input type="checkbox" checked={!!documentos[k]} onChange={() => toggleDoc(k)} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div>
            {DOCS_RIGHT.map(([k, label]) => (
              <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                <input type="checkbox" checked={!!documentos[k]} onChange={() => toggleDoc(k)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Anticipos / Comentarios */}
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
        <h3 style={{ marginTop: 0 }}>Anticipos y comentarios</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <TextField
            label="Anticipo 1" size="small"
            value={anticipos.anticipo1 || ''}
            onChange={(e) =>
              setRow((p) => ({ ...p, anticipos: { ...(p.anticipos || {}), anticipo1: e.target.value } }))
            }
          />
          <TextField
            label="Anticipo 2" size="small"
            value={anticipos.anticipo2 || ''}
            onChange={(e) =>
              setRow((p) => ({ ...p, anticipos: { ...(p.anticipos || {}), anticipo2: e.target.value } }))
            }
          />
          <TextField
            label="Anticipo 3" size="small"
            value={anticipos.anticipo3 || ''}
            onChange={(e) =>
              setRow((p) => ({ ...p, anticipos: { ...(p.anticipos || {}), anticipo3: e.target.value } }))
            }
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <TextField
            label="Comentarios"
            multiline
            minRows={3}
            fullWidth
            value={row.comentariosEstatus || ''}
            onChange={(e) => setRow((p) => ({ ...p, comentariosEstatus: e.target.value }))}
          />
        </div>
      </div>
    </div>
  );
}
