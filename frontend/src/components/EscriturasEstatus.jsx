// src/components/EscrituraEstatus.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Button,
  TextField,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

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

const fmtDate = (d) => {
  if (!d) return '';
  try { return String(d).slice(0, 10); } catch { return ''; }
};

const currency = (n) => {
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
};

const pickTelefono = (c) =>
  c?.numero_telefono || c?.telefono || c?.tel || c?.celular || c?.movil || c?.phone || '';

export default function EscrituraEstatus({ escrituraId, onClose }) {
  const [row, setRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // cliente
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');

  // recibos
  const [recibos, setRecibos] = useState([]);
  const [loadingRecibos, setLoadingRecibos] = useState(false);

  // pdf viewer
  const [openPdf, setOpenPdf] = useState(false);
  const [pdfRecibo, setPdfRecibo] = useState(null);

  const documentos = row?.documentos || {};


   const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isCancelado = (r) => /cancel/i.test(String(r?.estatus || r?.status || ''));


  const resumenPagos = useMemo(() => {
  const honorarios = money(row?.totalHonorarios);
  const impuestos  = money(row?.totalImpuestos);
  const extras     = money(row?.totalGastosExtra);

  const totalEscritura = honorarios + impuestos + extras;

  const pagado = (recibos || []).reduce((acc, r) => {
    if (isCancelado(r)) return acc;
    const monto = money(r?.total ?? r?.monto ?? r?.importeTotal);
    return acc + monto;
  }, 0);

  const saldo = totalEscritura - pagado; // NO lo forces a 0, así ves si algo está raro

  return { honorarios, impuestos, extras, totalEscritura, pagado, saldo };
}, [row, recibos]);



  const totals = useMemo(() => {
    const keys = [...DOCS_LEFT, ...DOCS_RIGHT].map(([k]) => k);
    const done = keys.filter((k) => Boolean(documentos?.[k])).length;
    return { total: keys.length, done, pending: keys.length - done };
  }, [documentos]);

  const loadCliente = async () => {
  setClienteNombre('');
  setClienteTelefono('');
  if (!escrituraId) return;

  try {
    const { data } = await axios.get(`${API}/escrituras/${escrituraId}/entrega-info`);
    setClienteNombre(data?.clienteNombre || '');
    setClienteTelefono(data?.telefono || '');
  } catch {
    setClienteNombre('');
    setClienteTelefono('');
  }
};

  // ✅ SOLO LOS RECIBOS DEL TRÁMITE (por control y tipoTramite)
  const loadRecibos = async (numeroControl) => {
  setRecibos([]);
  if (!numeroControl) return;

  setLoadingRecibos(true);
  try {
    const { data } = await axios.get(
      `${API}/recibos/escrituras/${encodeURIComponent(numeroControl)}/history`
    );

    // tu backend responde { ok:true, data:{ items:[...] } }
    const arr = data?.data?.items || [];
    setRecibos(Array.isArray(arr) ? arr : []);
  } catch {
    setRecibos([]);
  } finally {
    setLoadingRecibos(false);
  }
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};



const montos = useMemo(() => {
  const honor = toNum(row?.totalHonorarios);
  const imp   = toNum(row?.totalImpuestos);
  const extra = toNum(row?.totalGastosExtra);

  const totalEscritura = honor + imp + extra;

  const pagado = (recibos || [])
    .filter(r => !isCancelado(r))
    .reduce((acc, r) => {
      const t = r?.total ?? r?.monto ?? r?.importeTotal;
      return acc + toNum(t);
    }, 0);

  const saldo = totalEscritura - pagado;

  return { honor, imp, extra, totalEscritura, pagado, saldo };
}, [row, recibos]);

  const load = async () => {
    if (!escrituraId) return;
    setLoading(true);

    try {
      const { data } = await axios.get(`${API}/escrituras/${escrituraId}`);

      const safe = {
        ...data,
        documentos: data?.documentos || {},
        comentariosEstatus: data?.comentariosEstatus || '',
        documentacionFaltante: data?.documentacionFaltante || '',
        fechaEnvioNTD: data?.fechaEnvioNTD ? String(data.fechaEnvioNTD).slice(0, 10) : '',
      };

      setRow(safe);

      await loadCliente();
      await loadRecibos(safe?.numeroControl);
    } catch {
      setRow(null);
      setClienteNombre('');
      setClienteTelefono('');
      setRecibos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [escrituraId]);

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
        comentariosEstatus: row.comentariosEstatus,
        documentacionFaltante: row.documentacionFaltante,
        fechaEnvioNTD: row.fechaEnvioNTD || null,
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  // ✅ RUTA PDF (AJUSTA A LA DE TU BACKEND / LA QUE YA USAS EN Recibos.jsx)
  const getPdfUrl = (recibo) => {
    // ejemplo típico:
    return `${API}/recibos/${recibo._id}/pdf`;
    // si tú ya tienes algo como recibo.pdfUrl:
    // return recibo.pdfUrl;
  };

  const verPdf = (recibo) => {
    setPdfRecibo(recibo);
    setOpenPdf(true);
  };

  const abrirEnNueva = () => {
    if (!pdfRecibo) return;
    window.open(getPdfUrl(pdfRecibo), '_blank', 'noopener,noreferrer');
  };

  if (!escrituraId) return <div style={{ padding: 16 }}>No hay ID de escritura.</div>;
  if (loading) return <div style={{ padding: 16 }}>Cargando…</div>;
  if (!row) return <div style={{ padding: 16 }}>No se pudo cargar la escritura.</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Estatus — Escritura #{row.numeroControl ?? '—'}</h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outlined" onClick={onClose}>Cerrar</Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Datos generales */}
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><b>Fecha:</b> {row.fecha ? fmtDate(row.fecha) : '—'}</div>
          <div><b>Abogado:</b> {row.abogado || '—'}</div>

          <div>
            <b>Cliente:</b> {row.cliente || '—'}
            
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
              <b>Teléfono:</b> {clienteTelefono || '—'}
            </div>
          </div>
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

      {/* ✅ Historial de recibos SOLO del trámite */}
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            Historial de recibos (Control {row?.numeroControl ?? '—'})
          </h3>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loadingRecibos ? <span style={{ fontSize: 12, color: '#666' }}>Cargando…</span> : null}
            <Button variant="outlined" size="small" onClick={() => loadRecibos(row?.numeroControl)}>
              Refrescar
            </Button>
          </div>


                 {/* ✅ Resumen de montos (YA fuera del flex) */}
<div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
  <div style={{ padding: 10, border: '1px solid #eee', borderRadius: 10 }}>
    <div style={{ fontSize: 12, color: '#666' }}>Total escritura</div>
    <div style={{ fontSize: 18, fontWeight: 700 }}>{currency(resumenPagos.totalEscritura)}</div>
    <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
      Honorarios: {currency(resumenPagos.honorarios)}<br />
      Impuestos: {currency(resumenPagos.impuestos)}<br />
      Extras: {currency(resumenPagos.extras)}
    </div>
  </div>

  <div style={{ padding: 10, border: '1px solid #eee', borderRadius: 10 }}>
    <div style={{ fontSize: 12, color: '#666' }}>Abonos / Pagado</div>
    <div style={{ fontSize: 18, fontWeight: 700 }}>{currency(resumenPagos.pagado)}</div>
    <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
      (Suma de recibos no cancelados)
    </div>
  </div>

  <div style={{ padding: 10, border: '1px solid #eee', borderRadius: 10 }}>
    <div style={{ fontSize: 12, color: '#666' }}>Saldo / Debe</div>
    <div style={{ fontSize: 18, fontWeight: 700 }}>{currency(resumenPagos.saldo)}</div>
    <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
      Total − Pagado
    </div>
  </div>
</div>

        </div>

        <div style={{ marginTop: 10 }}>
          {(!recibos || recibos.length === 0) ? (
            <div style={{ color: '#666', fontSize: 14 }}>
              No hay recibos para esta escritura.
            </div>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><b>Recibo</b></TableCell>
                  <TableCell><b>Fecha</b></TableCell>
                  <TableCell><b>Concepto</b></TableCell>
                  <TableCell align="right"><b>Total</b></TableCell>
                  <TableCell><b>Estatus</b></TableCell>
                  <TableCell align="right"><b>PDF</b></TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {recibos.map((r, idx) => {
                  const folio = r?.folio || r?.numeroRecibo || `#${idx + 1}`;
                  const fecha = fmtDate(r?.fecha || r?.createdAt);
                  const concepto = r?.concepto || r?.descripcion || r?.tipo || r?.motivo || '—';
                  const total = currency(r?.total || r?.monto || r?.importeTotal);
                  const estatus = (r?.estatus || r?.status || '').toString() || '—';
                  const isCancel = /cancel/i.test(estatus);

                  return (
                    <TableRow
                      key={r?._id || `${folio}-${idx}`}
                      hover
                      style={{ cursor: 'pointer' }}
                      onClick={() => verPdf(r)}
                    >
                      <TableCell>{folio}</TableCell>
                      <TableCell>{fecha || '—'}</TableCell>
                      <TableCell>{concepto}</TableCell>
                      <TableCell align="right">{total || '—'}</TableCell>
                      <TableCell>
                        <Chip size="small" label={estatus} variant={isCancel ? 'outlined' : 'filled'} />
                      </TableCell>

                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Button size="small" variant="outlined" onClick={() => verPdf(r)}>
                          Ver PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Notas */}
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
        <h3 style={{ marginTop: 0 }}>Notas</h3>

        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 10, alignItems: 'center' }}>
          <TextField
            label="Fecha envío NTD"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={row.fechaEnvioNTD || ''}
            onChange={(e) => setRow((p) => ({ ...p, fechaEnvioNTD: e.target.value }))}
          />
          <div />
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

        <div style={{ marginTop: 10 }}>
          <TextField
            label="Documentación faltante"
            multiline
            minRows={3}
            fullWidth
            value={row.documentacionFaltante || ''}
            onChange={(e) => setRow((p) => ({ ...p, documentacionFaltante: e.target.value }))}
            placeholder="Ej: Falta INE del comprador, predial actualizado, agua, etc."
          />
        </div>
      </div>

      {/* ✅ Modal para ver PDF */}
      <Dialog open={openPdf} onClose={() => setOpenPdf(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <span>PDF — Recibo {pdfRecibo?.folio || pdfRecibo?.numeroRecibo || ''}</span>
          <IconButton onClick={() => setOpenPdf(false)}><CloseIcon /></IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ padding: 0 }}>
          {pdfRecibo ? (
            <iframe
              title="pdf-recibo"
              src={getPdfUrl(pdfRecibo)}
              style={{ width: '100%', height: '75vh', border: 0 }}
            />
          ) : (
            <div style={{ padding: 16 }}>Selecciona un recibo…</div>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpenPdf(false)}>Cerrar</Button>
          <Button variant="outlined" onClick={abrirEnNueva} disabled={!pdfRecibo}>
            Abrir en nueva pestaña
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
