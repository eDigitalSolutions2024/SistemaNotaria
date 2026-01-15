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
  Checkbox,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

// ✅ Ajusta la ruta si tu AuthContext está en otro lugar
import { useAuth } from '../auth/AuthContext';

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
  try {
    return String(d).slice(0, 10);
  } catch {
    return '';
  }
};

const currency = (n) => {
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
};

// ======================
// ✅ Comentarios como lista (Chips)
// Guardamos en DB como JSON string en comentariosEstatus
// ======================
const parseComentarios = (raw) => {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];

  // Nuevo formato: JSON
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return arr
        .filter(Boolean)
        .map((c) => ({
          id: c?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          text: String(c?.text || c || '').trim(),
          createdAt: c?.createdAt || null,
          by: c?.by || '',
        }))
        .filter((c) => c.text);
    }
  } catch {
    // formato viejo: texto libre
  }

  // Formato viejo: texto libre -> split por líneas
  return s
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: t,
      createdAt: null,
      by: '',
    }));
};

const serializeComentarios = (arr) => JSON.stringify(Array.isArray(arr) ? arr : []);

export default function EscrituraEstatus({ escrituraId, onClose }) {
  const { user } = useAuth();

  // ✅ Solo ADMIN y RECEPCION pueden ver/usar "Adjuntar recibos"
  const canAttachRecibos = useMemo(() => {
    const roles = []
      .concat(user?.roles || [])
      .concat(user?.rol || [])
      .concat(user?.role || [])
      .filter(Boolean)
      .map((r) => String(r).toUpperCase());
    return roles.includes('ADMIN') || roles.includes('RECEPCION');
  }, [user]);

  const [row, setRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // cliente
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');

  // recibos (historial ligado a la escritura/control)
  const [recibos, setRecibos] = useState([]);
  const [loadingRecibos, setLoadingRecibos] = useState(false);

  // pdf viewer
  const [openPdf, setOpenPdf] = useState(false);
  const [pdfRecibo, setPdfRecibo] = useState(null);

  // --- adjuntar recibos existentes (lista + búsqueda + paginación) ---
  const [openAttach, setOpenAttach] = useState(false);
  const [attachQuery, setAttachQuery] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [listItems, setListItems] = useState([]); // lista (paginada) de /api/recibos
  const [listPage, setListPage] = useState(1);
  const [listHasMore, setListHasMore] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]); // ids a adjuntar (multi)
  const [attaching, setAttaching] = useState(false);

  // ✅ NUEVO: comentarios como lista + input
  const [comentariosList, setComentariosList] = useState([]);
  const [comentarioInput, setComentarioInput] = useState('');


  // ✅ NUEVO: documentación faltante como lista + input
const [faltanteList, setFaltanteList] = useState([]);
const [faltanteInput, setFaltanteInput] = useState('');


  const documentos = row?.documentos || {};

  const money = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const isCancelado = (r) => /cancel/i.test(String(r?.estatus || r?.status || ''));

  const resumenPagos = useMemo(() => {
    const honorarios = money(row?.totalHonorarios);
    const impuestos = money(row?.totalImpuestos);
    const extras = money(row?.totalGastosExtra);

    const totalEscritura = honorarios + impuestos + extras;

    const pagado = (recibos || []).reduce((acc, r) => {
      if (isCancelado(r)) return acc;
      const monto = money(r?.total ?? r?.monto ?? r?.importeTotal ?? r?.totalPagado);
      return acc + monto;
    }, 0);

    const saldo = totalEscritura - pagado;

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

  // ✅ Historial: directos (control) + vinculados (ReciboLink)
  const loadRecibos = async (numeroControl) => {
    setRecibos([]);
    if (!numeroControl) return;

    setLoadingRecibos(true);
    try {
      const [directRes, linkedRes] = await Promise.all([
        axios.get(`${API}/recibos/escrituras/${encodeURIComponent(numeroControl)}/history`),
        axios.get(`${API}/recibos/links/by-control/${encodeURIComponent(numeroControl)}`),
      ]);

      const directItems = directRes?.data?.data?.items || [];
      const linkedItems = linkedRes?.data?.data || [];

      const linkedRows = (Array.isArray(linkedItems) ? linkedItems : []).map((r) => ({
        _id: r._id,
        numeroRecibo: String(r._id || '').slice(-4).toUpperCase(),
        fecha: r.fecha || r.createdAt,
        recibiDe: r.recibiDe,
        abogado: r.abogado,
        concepto: r.concepto,
        totalTramite: Number(r.totalTramite || 0),
        totalPagado: Number(r.totalPagado || 0),
        total: Number((r.total ?? r.totalPagado) || 0),
        estatus: r.estatus || 'Activo',
        pdfUrl: `/recibos/${r._id}/pdf`,
        _linked: true,
      }));

      const map = new Map();
      (Array.isArray(directItems) ? directItems : []).forEach((r) => map.set(String(r._id), r));
      linkedRows.forEach((r) => {
        const k = String(r._id);
        if (!map.has(k)) map.set(k, r);
      });

      const merged = Array.from(map.values()).sort((a, b) => {
        const da = new Date(a?.fecha || a?.createdAt || 0).getTime();
        const db = new Date(b?.fecha || b?.createdAt || 0).getTime();
        return da - db;
      });

      setRecibos(merged);
    } catch {
      setRecibos([]);
    } finally {
      setLoadingRecibos(false);
    }
  };

  const load = async () => {
    if (!escrituraId) return;
    setLoading(true);

    try {
      const { data } = await axios.get(`${API}/escrituras/${escrituraId}`);

      const safe = {
        ...data,
        documentos: data?.documentos || {},
        comentariosEstatus: data?.comentariosEstatus || '', // <- raw (string)
        documentacionFaltante: data?.documentacionFaltante || '',
        fechaEnvioNTD: data?.fechaEnvioNTD ? String(data.fechaEnvioNTD).slice(0, 10) : '',
      };

      setRow(safe);

      // ✅ Alimenta lista desde DB (soporta JSON nuevo o texto viejo)
setFaltanteList(parseComentarios(safe.documentacionFaltante));
setFaltanteInput('');

      // ✅ Alimenta lista desde DB
      setComentariosList(parseComentarios(safe.comentariosEstatus));
      setComentarioInput('');

      await loadCliente();
      await loadRecibos(safe?.numeroControl);
    } catch {
      setRow(null);
      setClienteNombre('');
      setClienteTelefono('');
      setRecibos([]);
      setComentariosList([]);
      setComentarioInput('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [escrituraId]);

  const toggleDoc = (key) => {
    setRow((prev) => ({
      ...(prev || {}),
      documentos: { ...(prev?.documentos || {}), [key]: !prev?.documentos?.[key] },
    }));
  };

  // ✅ NUEVO: agregar/eliminar comentario (chips)
  const addComentario = () => {
    const t = String(comentarioInput || '').trim();
    if (!t) return;

    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: t,
      createdAt: new Date().toISOString(),
      by: user?.nombre || user?.name || user?.username || '',
    };

    setComentariosList((prev) => [item, ...(prev || [])]); // nuevo arriba
    setComentarioInput('');
  };

  const deleteComentario = (id) => {
    setComentariosList((prev) => (prev || []).filter((c) => String(c.id) !== String(id)));
  };

  const save = async () => {
    if (!row?._id) return;
    setSaving(true);
    try {
      await axios.put(`${API}/escrituras/${row._id}`, {
        documentos: row.documentos,
        // ✅ Guardamos lista como JSON string
        comentariosEstatus: serializeComentarios(comentariosList),
        documentacionFaltante: serializeComentarios(faltanteList),
        fechaEnvioNTD: row.fechaEnvioNTD || null,
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addFaltante = () => {
  const t = String(faltanteInput || '').trim();
  if (!t) return;

  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: t,
    createdAt: new Date().toISOString(),
    by: user?.nombre || user?.name || user?.username || '',
  };

  setFaltanteList((prev) => [item, ...(prev || [])]);
  setFaltanteInput('');
};

const deleteFaltante = (id) => {
  setFaltanteList((prev) => (prev || []).filter((c) => String(c.id) !== String(id)));
};


  // ✅ PDF
  const getPdfUrl = (recibo) => `${API}/recibos/${recibo._id}/pdf`;

  const verPdf = (recibo) => {
    setPdfRecibo(recibo);
    setOpenPdf(true);
  };

  const abrirEnNueva = () => {
    if (!pdfRecibo) return;
    window.open(getPdfUrl(pdfRecibo), '_blank', 'noopener,noreferrer');
  };

  // =============================
  // Adjuntar recibos (lista completa + búsqueda)
  // =============================
  const LIST_RECIBOS_ENDPOINT = ({ q, page, limit }) => {
    const params = new URLSearchParams();
    params.set('page', String(page || 1));
    params.set('limit', String(limit || 25));
    if (q && String(q).trim()) params.set('q', String(q).trim());
    return `${API}/recibos?${params.toString()}`;
  };

  const LINK_ENDPOINT = `${API}/recibos/link`; // POST { reciboId, control }

  const linkedIdSet = useMemo(() => {
    const set = new Set();
    (recibos || []).forEach((r) => {
      if (r?._id) set.add(String(r._id));
    });
    return set;
  }, [recibos]);

  const resetAttachModal = () => {
    setAttachQuery('');
    setListItems([]);
    setListPage(1);
    setListHasMore(true);
    setSelectedIds([]);
    setListError('');
    setListLoading(false);
    setAttaching(false);
  };

  const fetchRecibosList = async ({ reset = false } = {}) => {
    if (!canAttachRecibos) return;

    const nextPage = reset ? 1 : listPage;
    const limit = 25;

    // evita doble fetch si ya no hay más
    if (!reset && !listHasMore) return;

    setListLoading(true);
    setListError('');
    try {
      const { data } = await axios.get(
        LIST_RECIBOS_ENDPOINT({ q: attachQuery, page: nextPage, limit })
      );

      // backend: { ok:true, total, page, limit, items }
      const items = Array.isArray(data?.items) ? data.items : [];
      const total = Number(data?.total || 0);

      const normalized = items.map((r) => ({
        ...r,
        _id: r?._id,
        folio: r?.numeroRecibo || String(r?._id || '').slice(-4).toUpperCase(),
        cliente: r?.recibiDe || '',
        total: Number(r?.total ?? r?.totalPagado ?? 0),
      }));

      const merged = reset ? normalized : [...listItems, ...normalized];
      setListItems(merged);

      const loadedCount = merged.length;
      setListHasMore(total ? loadedCount < total : items.length === limit);
      setListPage(nextPage + 1);
    } catch (e) {
      setListError(e?.response?.data?.msg || 'No se pudo cargar la lista de recibos.');
      if (reset) {
        setListItems([]);
        setListHasMore(false);
      }
    } finally {
      setListLoading(false);
    }
  };

  const openAttachModal = async () => {
    if (!canAttachRecibos) return;
    setOpenAttach(true);
    resetAttachModal();
    // carga inicial: lista completa (página 1)
    setTimeout(() => fetchRecibosList({ reset: true }), 0);
  };

  const closeAttachModal = () => {
    setOpenAttach(false);
    resetAttachModal();
  };

  // Debounce: cuando cambia attachQuery, recarga desde página 1
  useEffect(() => {
    if (!openAttach) return;
    if (!canAttachRecibos) return;

    const t = setTimeout(() => {
      setListPage(1);
      setListHasMore(true);
      setSelectedIds([]);
      fetchRecibosList({ reset: true });
    }, 350);

    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [attachQuery, openAttach, canAttachRecibos]);

  const toggleSelect = (id) => {
    const sid = String(id);
    setSelectedIds((prev) => {
      const has = prev.includes(sid);
      if (has) return prev.filter((x) => x !== sid);
      return [...prev, sid];
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const selectAllVisible = () => {
    const control = Number(row?.numeroControl);
    const eligible = (listItems || [])
      .filter((r) => r?._id)
      .filter((r) => {
        const isSameControlDirect = Number(r?.control) === control; // directo
        const isAlreadyInHistory = linkedIdSet.has(String(r._id));
        return !isSameControlDirect && !isAlreadyInHistory;
      })
      .map((r) => String(r._id));

    setSelectedIds((prev) => {
      const set = new Set(prev);
      eligible.forEach((id) => set.add(id));
      return Array.from(set);
    });
  };

  const attachSelected = async () => {
    const control = Number(row?.numeroControl);
    const ids = (selectedIds || []).filter(Boolean);

    if (!canAttachRecibos) return;
    if (!Number.isFinite(control)) return setListError('No hay número de control válido.');
    if (!ids.length) return setListError('Selecciona al menos un recibo.');

    setAttaching(true);
    setListError('');
    try {
      // Ligamos 1 por 1 (simple y compatible con tu backend actual)
      for (const reciboId of ids) {
        await axios.post(LINK_ENDPOINT, { reciboId, control });
      }
      closeAttachModal();
      await loadRecibos(control);
    } catch (e) {
      const msg = e?.response?.data?.msg || 'No se pudieron adjuntar los recibos.';
      setListError(msg);
    } finally {
      setAttaching(false);
    }
  };

  const folioOf = (r) => r?.folio || r?.numeroRecibo || String(r?._id || '').slice(-4).toUpperCase();
  const clienteOf = (r) => r?.cliente || r?.recibiDe || '';
  const conceptoOf = (r) => r?.concepto || r?.descripcion || r?.tipo || r?.motivo || '—';
  const totalOf = (r) => Number(r?.total ?? r?.totalPagado ?? r?.monto ?? r?.importeTotal ?? 0);

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
        <label
          key={k}
          style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}
        >
          <input type="checkbox" checked={!!documentos[k]} onChange={() => toggleDoc(k)} />
          <span>{label}</span>
        </label>
      ))}
    </div>

    <div>
      {DOCS_RIGHT.map(([k, label]) => (
        <label
          key={k}
          style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}
        >
          <input type="checkbox" checked={!!documentos[k]} onChange={() => toggleDoc(k)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  </div>

  {/* ✅ Documentación faltante (chips) */}
  <div style={{ marginTop: 14 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <TextField
        label="Documentación faltante (agrega uno por uno)"
        multiline
        minRows={2}
        fullWidth
        value={faltanteInput}
        onChange={(e) => setFaltanteInput(e.target.value)}
        placeholder="Ej: INE comprador, predial actualizado, agua, etc."
      />

      <Button
        variant="contained"
        onClick={addFaltante}
        disabled={!String(faltanteInput || '').trim()}
        style={{ height: 40, marginTop: 6 }}
      >
        Agregar
      </Button>
    </div>

    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {(faltanteList || []).length === 0 ? (
        <span style={{ fontSize: 12, color: '#666' }}>
          No hay documentación faltante registrada.
        </span>
      ) : (
        faltanteList.map((c) => (
          <Chip
            key={c.id}
            label={c.text}
            onDelete={() => deleteFaltante(c.id)}
            variant="outlined"
          />
        ))
      )}
    </div>
  </div>
</div>


      {/* Historial de recibos */}
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            Historial de recibos (Control {row?.numeroControl ?? '—'})
          </h3>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loadingRecibos ? <span style={{ fontSize: 12, color: '#666' }}>Cargando…</span> : null}

            {/* ✅ SOLO ADMIN / RECEPCION */}
            {canAttachRecibos ? (
              <Button variant="outlined" size="small" onClick={openAttachModal}>
                Adjuntar recibos
              </Button>
            ) : null}

            <Button variant="outlined" size="small" onClick={() => loadRecibos(row?.numeroControl)}>
              Refrescar
            </Button>
          </div>
        </div>

        {/* Resumen */}
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
            <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>(Suma de recibos no cancelados)</div>
          </div>

          <div style={{ padding: 10, border: '1px solid #eee', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: '#666' }}>Saldo / Debe</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{currency(resumenPagos.saldo)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>Total − Pagado</div>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          {(!recibos || recibos.length === 0) ? (
            <div style={{ color: '#666', fontSize: 14 }}>No hay recibos para esta escritura.</div>
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
                  const total = currency(r?.total || r?.monto || r?.importeTotal || r?.totalPagado);
                  const estatus = (r?.estatus || r?.status || '').toString() || '—';
                  const isCancel = /cancel/i.test(estatus);

                  return (
                    <TableRow
                      key={r?._id || `${folio}-${idx}`}
                      hover
                      style={{ cursor: 'pointer' }}
                      onClick={() => verPdf(r)}
                    >
                      <TableCell>
                        {folio}
                        {r?._linked ? (
                          <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>
                            (Vinculado)
                          </span>
                        ) : null}
                      </TableCell>
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

        {/* ✅ Comentarios (nuevo) */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <TextField
              label="Comentario (agrega uno por uno)"
              multiline
              minRows={2}
              fullWidth
              value={comentarioInput}
              onChange={(e) => setComentarioInput(e.target.value)}
              placeholder="Escribe un comentario y presiona Agregar…"
            />
            <Button
              variant="contained"
              onClick={addComentario}
              disabled={!String(comentarioInput || '').trim()}
              style={{ height: 40, marginTop: 6 }}
            >
              Agregar
            </Button>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(comentariosList || []).length === 0 ? (
              <span style={{ fontSize: 12, color: '#666' }}>Aún no hay comentarios.</span>
            ) : (
              comentariosList.map((c) => (
                <Chip
                  key={c.id}
                  label={c.text}
                  onDelete={() => deleteComentario(c.id)}
                  variant="outlined"
                />
              ))
            )}
          </div>
        </div>

        
      </div>

      {/* ✅ Acciones duplicadas al final */}
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="outlined" onClick={onClose}>Cerrar</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>

      {/* ✅ Modal: Adjuntar recibos existentes (LISTA COMPLETA + BÚSQUEDA + CARGAR MÁS) */}
      <Dialog open={openAttach} onClose={closeAttachModal} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <span>Adjuntar recibos al trámite (Control {row?.numeroControl ?? '—'})</span>
          <IconButton onClick={closeAttachModal}><CloseIcon /></IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {!canAttachRecibos ? (
            <div style={{ color: '#b00020' }}>
              No tienes permisos para adjuntar recibos.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <TextField
                  label="Buscar (folio, cliente, concepto, abogado, control, fecha)"
                  placeholder="Ej: E22A o 14 o Juan o 2025-12-23"
                  size="small"
                  fullWidth
                  value={attachQuery}
                  onChange={(e) => setAttachQuery(e.target.value)}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    setListPage(1);
                    setListHasMore(true);
                    setSelectedIds([]);
                    fetchRecibosList({ reset: true });
                  }}
                  disabled={listLoading}
                >
                  {listLoading ? 'Cargando…' : 'Buscar'}
                </Button>
              </div>

              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#666' }}>
                  Seleccionados: <b>{selectedIds.length}</b>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" variant="outlined" onClick={selectAllVisible} disabled={!listItems.length}>
                    Seleccionar visibles
                  </Button>
                  <Button size="small" variant="outlined" onClick={clearSelection} disabled={!selectedIds.length}>
                    Limpiar
                  </Button>
                </div>
              </div>

              {listError ? (
                <div style={{ marginTop: 10, color: '#b00020', fontSize: 13 }}>
                  {listError}
                </div>
              ) : null}

              <div style={{ marginTop: 10 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={48}></TableCell>
                      <TableCell><b>Folio</b></TableCell>
                      <TableCell><b>Cliente</b></TableCell>
                      <TableCell><b>Fecha</b></TableCell>
                      <TableCell><b>Concepto</b></TableCell>
                      <TableCell align="right"><b>Total</b></TableCell>
                      <TableCell><b>Ligado</b></TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {(!listItems || listItems.length === 0) && listLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} style={{ color: '#666' }}>
                          Cargando lista…
                        </TableCell>
                      </TableRow>
                    ) : (!listItems || listItems.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={7} style={{ color: '#666' }}>
                          No hay recibos para mostrar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      listItems.map((r, idx) => {
                        const id = String(r?._id || `lr-${idx}`);
                        const control = Number(row?.numeroControl);

                        // "Ya ligado" si:
                        // 1) ya está en historial (directo o vinculado)
                        // 2) o es directo del mismo control
                        const isSameControlDirect = Number(r?.control) === control;
                        const alreadyLinked = linkedIdSet.has(String(r?._id)) || isSameControlDirect;

                        const checked = selectedIds.includes(String(r?._id));
                        const folio = folioOf(r);

                        return (
                          <TableRow
                            key={id}
                            hover
                            style={{
                              opacity: alreadyLinked ? 0.55 : 1,
                              cursor: alreadyLinked ? 'not-allowed' : 'pointer'
                            }}
                            onClick={() => {
                              if (alreadyLinked || !r?._id) return;
                              toggleSelect(r._id);
                            }}
                          >
                            <TableCell>
                              <Checkbox
                                checked={checked}
                                disabled={alreadyLinked || !r?._id}
                                onChange={() => {
                                  if (alreadyLinked || !r?._id) return;
                                  toggleSelect(r._id);
                                }}
                              />
                            </TableCell>

                            <TableCell>{folio}</TableCell>
                            <TableCell>{clienteOf(r) || '—'}</TableCell>
                            <TableCell>{fmtDate(r?.fecha) || '—'}</TableCell>
                            <TableCell>{conceptoOf(r)}</TableCell>
                            <TableCell align="right">{currency(totalOf(r))}</TableCell>

                            <TableCell>
                              {alreadyLinked ? (
                                <Chip size="small" label="Ya ligado" variant="outlined" />
                              ) : (
                                <Chip size="small" label="Disponible" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>

                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
                  {listHasMore ? (
                    <Button
                      variant="outlined"
                      onClick={() => fetchRecibosList({ reset: false })}
                      disabled={listLoading}
                    >
                      {listLoading ? 'Cargando…' : 'Cargar más'}
                    </Button>
                  ) : (
                    <span style={{ fontSize: 12, color: '#666' }}>
                      No hay más recibos.
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={closeAttachModal} disabled={attaching}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={attachSelected}
            disabled={!canAttachRecibos || attaching || !selectedIds.length}
          >
            {attaching ? 'Adjuntando…' : `Adjuntar (${selectedIds.length})`}
          </Button>
        </DialogActions>
      </Dialog>

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
