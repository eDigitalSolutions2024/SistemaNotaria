// src/components/ControlCerveceria.jsx
// Control de trámites de "Gestiones especiales" — Cervecería y Controladora
// son DOS CLIENTES distintos (cada uno tenía su propia hoja en el Excel
// manual), así que este mismo componente se monta dos veces en MainPage.jsx
// con un prop "empresa" distinto ('Cervecería' / 'Controladora') — nunca
// mezclan datos, cada pantalla solo ve y exporta los suyos.
//
// Formulario simple + archivo adjunto por trámite + 3 banderas de estatus
// (Facturado / Entregado / Firmado) con fecha.
//
// Al dar de alta se puede capturar "Entrego" + fecha UNA sola vez y agregar
// varias filas de documentos (cada una con su propio archivo) en el mismo
// lote — como las entregas del Excel original, que agrupaban varios tipos
// de documento bajo un mismo nombre/fecha.
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import SportsBarIcon from '@mui/icons-material/SportsBar';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useAuth } from '../auth/AuthContext';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010/api';

const EMPTY_EDIT_FORM = {
  cliente: '', tipoDocumento: '', hojas: '', cantidad: '', fecha: '', costo: '',
};
const EMPTY_ITEM = { tipoDocumento: '', hojas: '', cantidad: '', costo: '', file: null };

// "Facturado" ya no es una bandera suelta aquí — se obtiene de si el
// trámite pertenece a una factura (row.facturaId), por eso no va en esta
// lista; se renderiza aparte en la tabla.
const ESTATUS_CAMPOS = [
  { key: 'entregado', label: 'Entregado' },
  { key: 'firmado',   label: 'Firmado' },
];

function fmtFecha(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('es-MX');
}
function fmtCosto(n) {
  if (n === null || n === undefined || n === '') return '—';
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}
// Fecha local de hoy en formato YYYY-MM-DD (lo que espera <input type="date">).
// Usa componentes locales, no toISOString(), para no correrse de día según
// el huso horario (mismo motivo que el arreglo de fechas del backend).
function hoyYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ControlCerveceria({ empresa }) {
  const { user } = useAuth();
  const role = user?.role || '';
  const esAdmin = role === 'ADMIN' || role === 'admin';
  const puedeFacturar = ['ADMIN', 'RECEPCION'].includes(String(role).toUpperCase());

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const [filtroCliente, setFiltroCliente] = useState('');

  // ── Alta en lote (varios documentos, mismo "Entrego" + fecha) ──
  const [adding, setAdding] = useState(false);
  const [entregoNuevo, setEntregoNuevo] = useState('');
  const [fechaNuevo, setFechaNuevo] = useState(hoyYMD());
  const [itemsNuevos, setItemsNuevos] = useState([{ ...EMPTY_ITEM }]);
  // Documento general: un solo archivo que cubre toda la entrega (ej. el
  // expediente completo escaneado). Es opcional y solo se usa como
  // respaldo para las filas que no traigan su propio documento específico.
  const [documentoGeneral, setDocumentoGeneral] = useState(null);

  // ── Edición (un solo trámite) ──
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_EDIT_FORM);
  const [file, setFile] = useState(null);

  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/cerveceria`, {
        params: { empresa, ...(filtroCliente ? { cliente: filtroCliente } : {}) },
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo cargar la lista.' });
    } finally {
      setLoading(false);
    }
  }, [empresa, filtroCliente]);

  useEffect(() => { cargar(); }, [cargar]);

  const resetAll = () => {
    setAdding(false);
    setEntregoNuevo('');
    setFechaNuevo(hoyYMD());
    setItemsNuevos([{ ...EMPTY_ITEM }]);
    setDocumentoGeneral(null);
    setEditingId(null);
    setForm(EMPTY_EDIT_FORM);
    setFile(null);
  };

  const startAdd = () => {
    resetAll();
    setAdding(true);
  };

  const startEdit = (row) => {
    resetAll();
    setEditingId(row._id);
    setForm({
      cliente: row.cliente || '',
      tipoDocumento: row.tipoDocumento || '',
      hojas: row.hojas ?? '',
      cantidad: row.cantidad ?? '',
      fecha: row.fecha ? new Date(row.fecha).toISOString().slice(0, 10) : '',
      costo: row.costo ?? '',
    });
  };

  const agregarFila = () => setItemsNuevos((prev) => [...prev, { ...EMPTY_ITEM }]);
  const quitarFila = (idx) => setItemsNuevos((prev) => prev.filter((_, i) => i !== idx));
  const actualizarFila = (idx, patch) => setItemsNuevos((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const guardarLote = async () => {
    if (!entregoNuevo.trim()) {
      setMsg({ type: 'warn', text: 'Entrego es obligatorio.' });
      return;
    }
    if (!documentoGeneral) {
      setMsg({ type: 'warn', text: 'El soporte es obligatorio — súbelo antes de guardar.' });
      return;
    }
    const filasValidas = itemsNuevos.filter((it) => it.tipoDocumento.trim());
    if (filasValidas.length === 0) {
      setMsg({ type: 'warn', text: 'Agrega al menos un tipo de documento.' });
      return;
    }

    setSaving(true);
    setMsg(null);
    let guardados = 0;
    // Mismo id para todas las filas de esta entrega — así se pueden
    // distinguir en la tabla aunque coincidan en fecha con otra entrega.
    const entregaId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      for (const item of filasValidas) {
        const fd = new FormData();
        fd.append('empresa', empresa);
        fd.append('cliente', entregoNuevo.trim());
        fd.append('fecha', fechaNuevo || '');
        fd.append('entregaId', entregaId);
        fd.append('tipoDocumento', item.tipoDocumento);
        fd.append('hojas', item.hojas ?? '');
        fd.append('cantidad', item.cantidad ?? '');
        fd.append('costo', item.costo ?? '');
        // El documento propio de la fila y el documento general de la
        // entrega se guardan POR SEPARADO — no se reemplazan entre sí, así
        // se pueden ver los dos de forma independiente en la tabla.
        if (item.file) fd.append('documento', item.file);
        if (documentoGeneral) fd.append('documentoGeneral', documentoGeneral);
        // eslint-disable-next-line no-await-in-loop
        await axios.post(`${API}/cerveceria`, fd);
        guardados += 1;
      }
      setMsg({ type: 'ok', text: `${guardados} documento(s) guardado(s).` });
      resetAll();
      cargar();
    } catch (e) {
      setMsg({
        type: 'error',
        text: `${e?.response?.data?.mensaje || 'No se pudo guardar.'} (se guardaron ${guardados} de ${filasValidas.length} antes del error)`,
      });
      cargar();
    } finally {
      setSaving(false);
    }
  };

  const guardarEdicion = async () => {
    if (!form.cliente.trim() || !form.tipoDocumento.trim()) {
      setMsg({ type: 'warn', text: 'Entrego y tipo de documento son obligatorios.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (file) fd.append('documento', file);
      await axios.put(`${API}/cerveceria/${editingId}`, fd);
      setMsg({ type: 'ok', text: 'Trámite actualizado.' });
      resetAll();
      cargar();
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo guardar.' });
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (row) => {
    if (!window.confirm(`¿Eliminar el trámite "${row.tipoDocumento}" de ${row.cliente}? Esta acción no se puede deshacer.`)) return;
    try {
      await axios.delete(`${API}/cerveceria/${row._id}`);
      setRows((prev) => prev.filter((r) => r._id !== row._id));
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo eliminar.' });
    }
  };

  const toggleEstatus = async (row, campo) => {
    const nuevoHecho = !row[campo]?.hecho;
    // Optimista: refleja el cambio de inmediato, revierte si falla.
    setRows((prev) => prev.map((r) => (
      r._id === row._id ? { ...r, [campo]: { hecho: nuevoHecho, fecha: nuevoHecho ? new Date().toISOString() : null } } : r
    )));
    try {
      await axios.patch(`${API}/cerveceria/${row._id}/estatus`, { campo, hecho: nuevoHecho });
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo actualizar el estatus.' });
      cargar();
    }
  };

  const descargar = (row, tipo = 'propio') => {
    const sufijo = tipo === 'general' ? '?tipo=general' : '';
    window.location.href = `${API}/cerveceria/${row._id}/documento${sufijo}`;
  };

  // previewTipo distingue si se está viendo el documento propio de la fila
  // o el documento general compartido de la entrega — cada uno vive en su
  // propio campo (archivoPath vs archivoGeneralPath).
  const [previewRow, setPreviewRow] = useState(null);
  const [previewTipo, setPreviewTipo] = useState('propio');
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const abrirPreview = (row, tipo = 'propio') => {
    setPreviewRow(row);
    setPreviewTipo(tipo);
  };

  const previewNombre = previewTipo === 'general' ? previewRow?.archivoGeneralNombre : previewRow?.archivoNombre;
  const previewPath = previewTipo === 'general' ? previewRow?.archivoGeneralPath : previewRow?.archivoPath;
  const previewExt = (previewNombre || previewPath || '').split('.').pop()?.toLowerCase() || '';
  const esImagen = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(previewExt);
  const esPdf = previewExt === 'pdf';
  const previewQS = previewTipo === 'general' ? '&tipo=general' : '';

  // Los PDF se piden como blob (no navegando directo a la URL) porque si el
  // navegador tiene activado "descargar PDFs en vez de abrirlos", un
  // <iframe src="..."> a la URL del servidor dispara la descarga en vez de
  // mostrar el contenido. Un blob: URL sí lo renderiza siempre.
  useEffect(() => {
    if (!previewRow || !esPdf) { setPreviewBlobUrl(null); return undefined; }
    let objectUrl = null;
    let cancelado = false;
    setPreviewLoading(true);
    setPreviewError('');
    axios.get(`${API}/cerveceria/${previewRow._id}/documento?modo=inline${previewQS}`, { responseType: 'blob' })
      .then((res) => {
        if (cancelado) return;
        objectUrl = URL.createObjectURL(res.data);
        setPreviewBlobUrl(objectUrl);
      })
      .catch(() => { if (!cancelado) setPreviewError('No se pudo cargar la vista previa.'); })
      .finally(() => { if (!cancelado) setPreviewLoading(false); });
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewRow, previewTipo, esPdf, previewQS]);

  const previewImgUrl = previewRow && esImagen ? `${API}/cerveceria/${previewRow._id}/documento?modo=inline${previewQS}` : '';

  const [exportDesde, setExportDesde] = useState('');
  const [exportHasta, setExportHasta] = useState('');
  const [exportando, setExportando] = useState(false);

  const exportarExcel = async () => {
    setExportando(true);
    setMsg(null);
    try {
      const params = { empresa };
      if (exportDesde) params.desde = exportDesde;
      if (exportHasta) params.hasta = exportHasta;
      const res = await axios.get(`${API}/cerveceria/export`, { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `control_${empresa.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg({ type: 'error', text: 'No se pudo exportar el Excel.' });
    } finally {
      setExportando(false);
    }
  };

  const [importando, setImportando] = useState(false);

  const importarExcel = async (file) => {
    if (!file) return;
    setImportando(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('empresa', empresa);
      const { data } = await axios.post(`${API}/cerveceria/import`, fd);
      const extra = data.errores?.length ? ` (${data.errores.length} fila(s) con problemas, ver consola)` : '';
      if (data.errores?.length) console.warn('Errores al importar Cervecería:', data.errores);
      setMsg({
        type: data.errores?.length ? 'warn' : 'ok',
        text: `Se importaron ${data.insertadas} de ${data.recibidas} fila(s) detectadas.${extra} Recuerda: el Excel no trae documentos adjuntos — quedan marcados "Sin archivo" hasta que los subas manualmente.`,
      });
      cargar();
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo importar el Excel.' });
    } finally {
      setImportando(false);
    }
  };

  // ── Nueva factura: agrupa documentos sin facturar de un rango de fechas ──
  const [facturaModalOpen, setFacturaModalOpen] = useState(false);
  const [facturaDesde, setFacturaDesde] = useState('');
  const [facturaHasta, setFacturaHasta] = useState('');
  const [facturaCandidatos, setFacturaCandidatos] = useState([]);
  const [facturaBuscando, setFacturaBuscando] = useState(false);
  const [facturaSeleccionados, setFacturaSeleccionados] = useState([]);
  const [facturaNumero, setFacturaNumero] = useState('');
  const [facturaFechaInput, setFacturaFechaInput] = useState('');
  const [facturaGuardando, setFacturaGuardando] = useState(false);

  const abrirModalFactura = () => {
    setFacturaModalOpen(true);
    setFacturaDesde('');
    setFacturaHasta('');
    setFacturaCandidatos([]);
    setFacturaSeleccionados([]);
    setFacturaNumero('');
    setFacturaFechaInput('');
  };

  const buscarCandidatosFactura = async () => {
    setFacturaBuscando(true);
    setMsg(null);
    try {
      const params = { empresa, sinFactura: '1' };
      if (facturaDesde) params.desde = facturaDesde;
      if (facturaHasta) params.hasta = facturaHasta;
      const { data } = await axios.get(`${API}/cerveceria`, { params });
      setFacturaCandidatos(Array.isArray(data) ? data : []);
      setFacturaSeleccionados([]);
    } catch (e) {
      setMsg({ type: 'error', text: 'No se pudieron buscar documentos.' });
    } finally {
      setFacturaBuscando(false);
    }
  };

  const toggleCandidatoFactura = (id) => {
    setFacturaSeleccionados((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const totalSeleccionadosFactura = facturaCandidatos
    .filter((c) => facturaSeleccionados.includes(c._id))
    .reduce((acc, c) => acc + (Number(c.costo) || 0), 0);

  const crearFactura = async () => {
    if (!facturaNumero.trim()) {
      setMsg({ type: 'warn', text: 'El número de factura es obligatorio.' });
      return;
    }
    if (facturaSeleccionados.length === 0) {
      setMsg({ type: 'warn', text: 'Selecciona al menos un documento.' });
      return;
    }
    setFacturaGuardando(true);
    setMsg(null);
    try {
      await axios.post(`${API}/cerveceria/facturas`, {
        empresa,
        numeroFactura: facturaNumero.trim(),
        fecha: facturaFechaInput || null,
        tramiteIds: facturaSeleccionados,
      });
      setMsg({ type: 'ok', text: `Factura ${facturaNumero.trim()} creada con ${facturaSeleccionados.length} documento(s).` });
      setFacturaModalOpen(false);
      cargar();
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo crear la factura.' });
    } finally {
      setFacturaGuardando(false);
    }
  };

  // ── Lista de facturas ya creadas ──
  const [facturasListOpen, setFacturasListOpen] = useState(false);
  const [facturasList, setFacturasList] = useState([]);
  const [facturasLoading, setFacturasLoading] = useState(false);
  const [facturaDetalle, setFacturaDetalle] = useState(null);
  const [facturaDetalleLoading, setFacturaDetalleLoading] = useState(false);

  const abrirListaFacturas = async () => {
    setFacturasListOpen(true);
    setFacturaDetalle(null);
    setFacturasLoading(true);
    try {
      const { data } = await axios.get(`${API}/cerveceria/facturas`, { params: { empresa } });
      setFacturasList(Array.isArray(data) ? data : []);
    } catch (e) {
      setMsg({ type: 'error', text: 'No se pudo cargar la lista de facturas.' });
    } finally {
      setFacturasLoading(false);
    }
  };

  const verDetalleFactura = async (id) => {
    setFacturaDetalleLoading(true);
    try {
      const { data } = await axios.get(`${API}/cerveceria/facturas/${id}`);
      setFacturaDetalle(data);
    } catch (e) {
      setMsg({ type: 'error', text: 'No se pudo cargar el detalle de la factura.' });
    } finally {
      setFacturaDetalleLoading(false);
    }
  };

  const eliminarFactura = async (id) => {
    if (!window.confirm('¿Eliminar esta factura? Los documentos que incluye quedarán sin facturar de nuevo.')) return;
    try {
      await axios.delete(`${API}/cerveceria/facturas/${id}`);
      setFacturasList((prev) => prev.filter((f) => f._id !== id));
      setFacturaDetalle(null);
      cargar();
    } catch (e) {
      setMsg({ type: 'error', text: e?.response?.data?.mensaje || 'No se pudo eliminar la factura.' });
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <SportsBarIcon sx={{ fontSize: 26, color: '#1e40af' }} />
        <h2 style={{ margin: 0, fontSize: 20, color: '#1a2233' }}>Control de {empresa}</h2>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          onClick={() => (adding ? resetAll() : startAdd())}
        >
          {adding ? 'Cancelar' : '+ Agregar trámite'}
        </Button>
        <Button
          variant="contained"
          color="success"
          component="label"
          disabled={importando}
        >
          {importando ? 'Importando…' : 'Importar Excel'}
          <input
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              importarExcel(e.target.files?.[0] || null);
              e.target.value = '';
            }}
          />
        </Button>
        {puedeFacturar && (
          <Button variant="contained" color="secondary" startIcon={<ReceiptLongIcon />} onClick={abrirModalFactura}>
            Nueva factura
          </Button>
        )}
        <Button variant="outlined" startIcon={<FactCheckIcon />} onClick={abrirListaFacturas}>
          Facturas
        </Button>
        <TextField
          size="small"
          placeholder="Buscar por Entrego…"
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <Button variant="outlined" onClick={cargar}>Actualizar</Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <TextField label="Desde" type="date" size="small" value={exportDesde}
            onChange={(e) => setExportDesde(e.target.value)}
            InputLabelProps={{ shrink: true }} style={{ minWidth: 150 }} />
          <TextField label="Hasta" type="date" size="small" value={exportHasta}
            onChange={(e) => setExportHasta(e.target.value)}
            InputLabelProps={{ shrink: true }} style={{ minWidth: 150 }} />
          <Button variant="contained" color="success" onClick={exportarExcel} disabled={exportando}>
            {exportando ? 'Exportando…' : '⬇ Exportar Excel'}
          </Button>
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: 14, padding: '9px 12px', borderRadius: 8, fontSize: 13,
          background: msg.type === 'error' ? '#fff4f4' : msg.type === 'warn' ? '#fff7e0' : '#e8fff1',
          border: `1px solid ${msg.type === 'error' ? '#f3c6c6' : msg.type === 'warn' ? '#f2c200' : '#62c28e'}`,
          color: msg.type === 'error' ? '#9a2a2a' : msg.type === 'warn' ? '#8a6d00' : '#1b5e20',
        }}>
          {msg.text}
        </div>
      )}

      {/* ── Alta en lote ── */}
      {adding && (
        <div style={{
          border: '1px solid #e3e7ee', borderRadius: 14, padding: 20, marginBottom: 20,
          background: '#fafbfd', boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: '#1a2233', marginBottom: 14 }}>
            Nueva entrega
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <TextField label="Entrego" size="small" value={entregoNuevo}
              onChange={(e) => setEntregoNuevo(e.target.value)}
              style={{ minWidth: 220 }} />
            <TextField label="Fecha" type="date" size="small" value={fechaNuevo}
              onChange={(e) => setFechaNuevo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              style={{ minWidth: 160 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#667085', letterSpacing: 0.3 }}>
                SOPORTE <span style={{ color: '#c62828' }}>· obligatorio</span>
              </span>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                borderRadius: 8, background: '#fff', border: '1px solid #d7deea', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: '#2b4bff', height: 23,
              }}>
                ⬆ {documentoGeneral ? documentoGeneral.name : 'Subir el soporte (un solo documento para toda la entrega)'}
                <input type="file" onChange={(e) => setDocumentoGeneral(e.target.files?.[0] || null)} style={{ display: 'none' }} />
              </label>
            </div>
            {documentoGeneral && (
              <Button size="small" color="error" onClick={() => setDocumentoGeneral(null)} style={{ alignSelf: 'flex-end' }}>
                Quitar
              </Button>
            )}
          </div>

          <div style={{ fontSize: 11.5, color: '#98a1b3', marginTop: -10, marginBottom: 14 }}>
            Si subes un soporte, se usa para cualquier fila de abajo que no tenga su propio archivo. Cada fila puede seguir teniendo el suyo si lo prefieres.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {itemsNuevos.map((item, idx) => (
              <div key={idx} style={{
                border: '1px solid #e3e7ee', borderRadius: 10, padding: 14,
                background: '#fff', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
              }}>
                <TextField label="Tipo de documento" size="small" value={item.tipoDocumento}
                  onChange={(e) => actualizarFila(idx, { tipoDocumento: e.target.value })}
                  placeholder="Aforo, Licencia de funcionamiento, Uso de suelo…"
                  style={{ minWidth: 240 }} />
                <TextField label="Hojas" type="number" size="small" value={item.hojas}
                  onChange={(e) => actualizarFila(idx, { hojas: e.target.value })}
                  style={{ minWidth: 90 }} />
                <TextField label="Cantidad" type="number" size="small" value={item.cantidad}
                  onChange={(e) => actualizarFila(idx, { cantidad: e.target.value })}
                  style={{ minWidth: 100 }} />
                <TextField label="Costo" type="number" size="small" value={item.costo}
                  onChange={(e) => actualizarFila(idx, { costo: e.target.value })}
                  style={{ minWidth: 120 }} />

                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                  borderRadius: 8, background: '#fff', border: '1px solid #d7deea', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, color: '#2b4bff',
                }}>
                  ⬆ Documento
                  <input type="file" onChange={(e) => actualizarFila(idx, { file: e.target.files?.[0] || null })} style={{ display: 'none' }} />
                </label>
                {item.file && <span style={{ fontSize: 12, color: '#44506b' }}>{item.file.name}</span>}

                {itemsNuevos.length > 1 && (
                  <Button size="small" color="error" onClick={() => quitarFila(idx)} style={{ minWidth: 0, padding: 4, marginLeft: 'auto' }}>
                    <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            variant="text"
            startIcon={<AddCircleOutlineIcon />}
            onClick={agregarFila}
            style={{ marginTop: 12 }}
          >
            Agregar otro documento
          </Button>

          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            marginTop: 18, paddingTop: 16, borderTop: '1px solid #e3e7ee',
          }}>
            <Button variant="outlined" onClick={resetAll}>Cancelar</Button>
            <Button variant="contained" onClick={guardarLote} disabled={saving || !documentoGeneral}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Edición de un trámite ── */}
      {editingId && (
        <div style={{
          border: '1px solid #e3e7ee', borderRadius: 14, padding: 20, marginBottom: 20,
          background: '#fafbfd', boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: '#1a2233', marginBottom: 14 }}>
            Editar trámite
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <TextField label="Entrego" size="small" value={form.cliente}
              onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
              style={{ minWidth: 200 }} />
            <TextField label="Tipo de documento" size="small" value={form.tipoDocumento}
              onChange={(e) => setForm((f) => ({ ...f, tipoDocumento: e.target.value }))}
              placeholder="Aforo, Licencia de funcionamiento, Uso de suelo…"
              style={{ minWidth: 260 }} />
            <TextField label="Hojas" type="number" size="small" value={form.hojas}
              onChange={(e) => setForm((f) => ({ ...f, hojas: e.target.value }))}
              style={{ minWidth: 100 }} />
            <TextField label="Cantidad" type="number" size="small" value={form.cantidad}
              onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))}
              style={{ minWidth: 100 }} />
            <TextField label="Fecha" type="date" size="small" value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              style={{ minWidth: 160 }} />
            <TextField label="Costo" type="number" size="small" value={form.costo}
              onChange={(e) => setForm((f) => ({ ...f, costo: e.target.value }))}
              style={{ minWidth: 130 }} />
          </div>

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px',
              borderRadius: 8, background: '#fff', border: '1px solid #d7deea', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: '#2b4bff',
            }}>
              ⬆ Elegir documento
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>
            {file && <span style={{ fontSize: 13, color: '#44506b' }}>{file.name}</span>}
            {!file && rows.find(r => r._id === editingId)?.archivoNombre && (
              <span style={{ fontSize: 12, color: '#98a1b3' }}>
                Ya tiene adjunto: {rows.find(r => r._id === editingId).archivoNombre} (sube uno nuevo para reemplazarlo)
              </span>
            )}
          </div>

          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            marginTop: 18, paddingTop: 16, borderTop: '1px solid #e3e7ee',
          }}>
            <Button variant="outlined" onClick={resetAll}>Cancelar</Button>
            <Button variant="contained" onClick={guardarEdicion} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}

      <div style={{ border: '1px solid #e3e7ee', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                {['Entrego', 'Tipo de documento', 'Hojas', 'Cantidad', 'Fecha', 'Costo', 'Facturado', 'Entregado', 'Firmado', 'Documento', 'Dado de alta por', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e3e7ee', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: '#98a1b3' }}>Cargando…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: '#98a1b3' }}>Sin trámites registrados.</td></tr>
              )}
              {!loading && rows.length > 0 && (() => {
                let grupoAnterior = null;
                // Agrupa filas capturadas juntas (misma entregaId, o para
                // datos viejos sin esa marca, mismo Entrego+Fecha) y alterna
                // un tono de fondo entre entregas consecutivas — así se
                // distingue una entrega de otra aunque compartan fecha.
                let entregaAnterior = null;
                let tintIndex = 0;
                return rows.map((row) => {
                  const grupo = row.fecha ? fmtFecha(row.fecha) : 'Sin fecha';
                  const esGrupoNuevo = grupo !== grupoAnterior;
                  grupoAnterior = grupo;

                  const entregaKey = row.entregaId || `${row.cliente}|${row.fecha || ''}`;
                  if (entregaKey !== entregaAnterior) {
                    tintIndex += 1;
                    entregaAnterior = entregaKey;
                  }
                  const rowBg = tintIndex % 2 === 0 ? '#eef2fb' : '#ffffff';

                  return (
                    <React.Fragment key={row._id}>
                      {esGrupoNuevo && (
                        <tr>
                          <td colSpan={12} style={{
                            padding: '7px 12px', background: '#dbeafe', fontWeight: 700,
                            color: '#1e3a8a', fontSize: 12.5,
                            borderTop: '2px solid #93c5fd', borderBottom: '1px solid #93c5fd',
                          }}>
                            📅 {grupo}
                          </td>
                        </tr>
                      )}
                <tr style={{ borderBottom: '1px solid #f1f5f9', background: rowBg }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1a2233' }}>{row.cliente}</td>
                  <td style={{ padding: '9px 12px' }}>{row.tipoDocumento}</td>
                  <td style={{ padding: '9px 12px' }}>{row.hojas ?? '—'}</td>
                  <td style={{ padding: '9px 12px' }}>{row.cantidad ?? '—'}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{fmtFecha(row.fecha)}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{fmtCosto(row.costo)}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    {row.facturaId?.numeroFactura ? (
                      <span style={{
                        fontSize: 11.5, fontWeight: 700, color: '#1a7f37',
                        background: '#e9f9ee', border: '1px solid #bfe6c9',
                        borderRadius: 6, padding: '3px 8px',
                      }}>
                        Fact. {row.facturaId.numeroFactura}
                      </span>
                    ) : (
                      <span style={{ color: '#c2c8d4', fontSize: 12 }}>Sin facturar</span>
                    )}
                  </td>
                  {ESTATUS_CAMPOS.map(({ key }) => (
                    <td key={key} style={{ padding: '9px 12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={!!row[key]?.hecho}
                          onChange={() => toggleEstatus(row, key)}
                        />
                        {row[key]?.hecho && (
                          <span style={{ fontSize: 11, color: '#1a7f37' }}>{fmtFecha(row[key].fecha)}</span>
                        )}
                      </label>
                    </td>
                  ))}
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    {!row.archivoPath && !row.archivoGeneralPath && (
                      <span style={{ color: '#c2c8d4', fontSize: 12 }}>Sin archivo</span>
                    )}
                    {row.archivoPath && (
                      <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => abrirPreview(row, 'propio')} style={{ marginRight: 6 }}>
                        Ver
                      </Button>
                    )}
                    {row.archivoGeneralPath && (
                      <Button size="small" variant="outlined" color="secondary" startIcon={<VisibilityIcon />} onClick={() => abrirPreview(row, 'general')}>
                        Ver soporte
                      </Button>
                    )}
                  </td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#667085' }}>
                    {row.creadoPorNombre || '—'}
                  </td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    {esAdmin ? (
                      <>
                        <Button size="small" onClick={() => startEdit(row)} style={{ minWidth: 0, padding: 4 }}>
                          <EditIcon sx={{ fontSize: 18 }} />
                        </Button>
                        <Button
                          size="small" color="error" onClick={() => eliminar(row)}
                          disabled={!!row.facturaId}
                          title={row.facturaId ? 'Ya está facturado — elimina la factura primero' : ''}
                          style={{ minWidth: 0, padding: 4 }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                        </Button>
                      </>
                    ) : (
                      <span style={{ color: '#c2c8d4', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!previewRow} onClose={() => setPreviewRow(null)} maxWidth="md" fullWidth
        PaperProps={{ style: { height: '85vh' } }}>
        <DialogTitle>{previewNombre || 'Documento'}{previewTipo === 'general' ? ' (soporte)' : ''}</DialogTitle>
        <DialogContent dividers style={{ display: 'flex', padding: 0 }}>
          {esPdf && previewLoading && (
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#667085', fontSize: 14 }}>
              Cargando vista previa…
            </div>
          )}
          {esPdf && !previewLoading && previewError && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#9a2a2a', fontSize: 14 }}>
              <span>{previewError}</span>
              <span>Descárgalo para abrirlo.</span>
            </div>
          )}
          {esPdf && !previewLoading && !previewError && previewBlobUrl && (
            <iframe src={previewBlobUrl} title="Vista previa" style={{ width: '100%', height: '100%', border: 'none' }} />
          )}
          {esImagen && (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
              <img src={previewImgUrl} alt={previewNombre} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          )}
          {!esPdf && !esImagen && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#667085', fontSize: 14 }}>
              <span>No hay vista previa disponible para este tipo de archivo.</span>
              <span>Descárgalo para abrirlo.</span>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewRow(null)}>Cerrar</Button>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => descargar(previewRow, previewTipo)}>
            Descargar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Nueva factura ── */}
      <Dialog open={facturaModalOpen} onClose={() => setFacturaModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Nueva factura — {empresa}</DialogTitle>
        <DialogContent dividers>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <TextField label="Desde" type="date" size="small" value={facturaDesde}
              onChange={(e) => setFacturaDesde(e.target.value)}
              InputLabelProps={{ shrink: true }} style={{ minWidth: 150 }} />
            <TextField label="Hasta" type="date" size="small" value={facturaHasta}
              onChange={(e) => setFacturaHasta(e.target.value)}
              InputLabelProps={{ shrink: true }} style={{ minWidth: 150 }} />
            <Button variant="outlined" onClick={buscarCandidatosFactura} disabled={facturaBuscando}>
              {facturaBuscando ? 'Buscando…' : 'Buscar documentos'}
            </Button>
          </div>

          <div style={{ fontSize: 12, color: '#98a1b3', marginBottom: 8 }}>
            Solo se muestran documentos que todavía no están en otra factura.
          </div>

          <div style={{ border: '1px solid #e3e7ee', borderRadius: 10, maxHeight: 280, overflowY: 'auto' }}>
            {facturaCandidatos.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#98a1b3', fontSize: 13 }}>
                {facturaBuscando ? 'Buscando…' : 'Sin resultados — ajusta el rango y busca.'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {facturaCandidatos.map((c) => (
                    <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', width: 30 }}>
                        <input
                          type="checkbox"
                          checked={facturaSeleccionados.includes(c._id)}
                          onChange={() => toggleCandidatoFactura(c._id)}
                        />
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{c.cliente}</td>
                      <td style={{ padding: '8px 10px' }}>{c.tipoDocumento}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtFecha(c.fecha)}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', textAlign: 'right' }}>{fmtCosto(c.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: '#1a2233' }}>
            {facturaSeleccionados.length} seleccionado(s) — total: {fmtCosto(totalSeleccionadosFactura)}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
            <TextField label="Número de factura" size="small" value={facturaNumero}
              onChange={(e) => setFacturaNumero(e.target.value)}
              style={{ minWidth: 220 }} />
            <TextField label="Fecha de factura" type="date" size="small" value={facturaFechaInput}
              onChange={(e) => setFacturaFechaInput(e.target.value)}
              InputLabelProps={{ shrink: true }} style={{ minWidth: 160 }} />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFacturaModalOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={crearFactura} disabled={facturaGuardando}>
            {facturaGuardando ? 'Creando…' : 'Crear factura'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Lista de facturas ── */}
      <Dialog open={facturasListOpen} onClose={() => setFacturasListOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {facturaDetalle ? `Factura ${facturaDetalle.numeroFactura}` : `Facturas — ${empresa}`}
        </DialogTitle>
        <DialogContent dividers>
          {!facturaDetalle && (
            <>
              {facturasLoading && (
                <div style={{ padding: 20, textAlign: 'center', color: '#98a1b3' }}>Cargando…</div>
              )}
              {!facturasLoading && facturasList.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#98a1b3' }}>Todavía no hay facturas creadas.</div>
              )}
              {!facturasLoading && facturasList.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      {['Número', 'Fecha', 'Documentos', 'Total', ''].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e3e7ee' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {facturasList.map((f) => (
                      <tr key={f._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{f.numeroFactura}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha)}</td>
                        <td style={{ padding: '8px 10px' }}>{f.cantidadDocumentos}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtCosto(f.total)}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <Button size="small" onClick={() => verDetalleFactura(f._id)}>Ver</Button>
                          {esAdmin && (
                            <Button size="small" color="error" onClick={() => eliminarFactura(f._id)}>Eliminar</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {facturaDetalle && (
            <>
              <Button size="small" onClick={() => setFacturaDetalle(null)} style={{ marginBottom: 12 }}>
                ← Volver a la lista
              </Button>
              {facturaDetalleLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#98a1b3' }}>Cargando…</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: '#44506b', marginBottom: 14 }}>
                    Fecha: {fmtFecha(facturaDetalle.fecha) || '—'} · Total: {fmtCosto(facturaDetalle.total)}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                        {['Entrego', 'Tipo de documento', 'Fecha', 'Costo'].map((h) => (
                          <th key={h} style={{ padding: '8px 10px', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e3e7ee' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(facturaDetalle.tramites || []).map((t) => (
                        <tr key={t._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{t.cliente}</td>
                          <td style={{ padding: '8px 10px' }}>{t.tipoDocumento}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtFecha(t.fecha)}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtCosto(t.costo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFacturasListOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
