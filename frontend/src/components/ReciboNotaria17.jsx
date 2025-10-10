// frontend/src/components/ReciboNotaria17.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "../css/ReciboNotaria17.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000";
const SAVE_URL = `${API}/recibos`; // ← ajusta si tu backend usa otra ruta

export default function ReciboNotaria17() {
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [showPrev, setShowPrev] = useState(false);

  const [f, setF] = useState({
    fecha: hoy,
    tipoTramite: "Protocolito",
    recibiDe: "",
    abogado: "",
    concepto: "",
    control: "",           // ← para Protocolito será “# Trámite”
    totalTramite: "",
    totalPagado: "",
    // campos “del sistema” (ocultos en Protocolito)
    totalImpuestos: "",
    valorAvaluo: "",
    totalGastosExtra: "",
    totalHonorarios: "",
  });

  // Para NO sobreescribir el concepto si el usuario ya lo modificó
  const [conceptoTouched, setConceptoTouched] = useState(false);

  // lista y selección de protocolitos
  const [numsLoading, setNumsLoading] = useState(false);
  const [numsError, setNumsError] = useState("");
  const [protocolitos, setProtocolitos] = useState([]);
  const [numeroSel, setNumeroSel] = useState("");
  const loadedOnce = useRef(false);

  // estado de guardado
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedId, setSavedId] = useState(""); // folio/ID devuelto por el backend


  // catálogo de abogados/asistentes y selección actual
const [catalogAbogados, setCatalogAbogados] = useState([]);
const [loadingAbogados, setLoadingAbogados] = useState(false);
const [abogadoId, setAbogadoId] = useState(''); // id numérico del modelo Abogado

  // Cargar números una sola vez cuando el tipo sea "Protocolito"
  useEffect(() => {
    if (f.tipoTramite !== "Protocolito") return;
    if (loadedOnce.current) return;
    setNumsLoading(true);
    setNumsError("");

    const url = `${API}/recibos/protocolitos/numeros`;
    axios
      .get(url)
      .then(({ data }) => {
        setProtocolitos(Array.isArray(data?.data) ? data.data : []);
        loadedOnce.current = true;
      })
      .catch((e) => {
        const msg = e.response?.data?.msg || e.message || "Network Error";
        setNumsError(msg);
      })
      .finally(() => setNumsLoading(false));
  }, [f.tipoTramite]);


  useEffect(() => {
  let alive = true;
  setLoadingAbogados(true);
  axios.get(`${API}/recibos/abogados`)
    .then(({ data }) => {
      if (!alive) return;
      const list = Array.isArray(data?.data) ? data.data : [];
      setCatalogAbogados(list);
    })
    .catch(err => console.error('CAT ABOGADOS ERR:', err))
    .finally(() => { if (alive) setLoadingAbogados(false); });
  return () => { alive = false; };
}, []);

  // Plantilla base editable en "Concepto" al cambiar tipo (sin pisar al usuario)
  useEffect(() => {
  if (conceptoTouched) return; // respetar lo que haya escrito el usuario
  const yaTiene = String(f.concepto || "").trim().length > 0;
  if (yaTiene) return;

  // Para Protocolito: no autollenar; el motivo llega al seleccionar el # de protocolito
  if (f.tipoTramite === "Protocolito") return;

  // Para otros tipos, conserva la plantilla
  const base = f.tipoTramite ? `Pago de ${f.tipoTramite} con numero de Protocolito #${f.numeroTramite} ` : "";
  if (base) setF((prev) => ({ ...prev, concepto: base }));
}, [f.tipoTramite, conceptoTouched]);
  // Al elegir # de protocolito, autorrellena campos y plantilla de concepto (sin pisar al usuario)
async function handleSelectNumero(value) {
  setNumeroSel(value);
  if (!value) return;

  try {
    const { data } = await axios.get(
      `${API}/recibos/protocolitos/${encodeURIComponent(value)}`
    );
    const d = data?.data || {};

    setF((prev) => {
      // Motivo tal cual viene del Protocolito (backend ya expone estos campos)
      const motivoPlano =
        d.tipoTramite || d.motivo || d.servicio || d.accion || "";

      // Plantilla requerida: "Pago de {motivo}"
      const conceptoPlantilla = motivoPlano
        ? `Pago de ${motivoPlano} con numero de Protocolito #${d.numeroTramite}`
        : (d.numeroTramite
            ? `Pago de trámite Protocolito #${d.numeroTramite}`
            : "Pago de trámite Protocolito");

      const keepUserConcept =
        conceptoTouched && String(prev.concepto || "").trim().length > 0;

      return {
        ...prev,
        fecha: d.fecha ? String(d.fecha).slice(0, 10) : prev.fecha,
        recibiDe: d.cliente || prev.recibiDe,
        abogado: d.abogado || prev.abogado,
        control: d.numeroTramite ? String(d.numeroTramite) : prev.control,
        concepto: keepUserConcept ? prev.concepto : conceptoPlantilla,
      };
    });
    const found = catalogAbogados.find(a => (a.nombre || '').trim() === (d.abogado || '').trim());
if (found) setAbogadoId(String(found.id));
  } catch (e) {
    alert(e.response?.data?.msg || e.message || "Error");
  }
}


// deja la fecha que ya tenía el usuario (o hoy), y limpia el resto
const resetFormForType = (tipo, keepFecha) => ({
  fecha: keepFecha || hoy,
  tipoTramite: tipo,
  recibiDe: "",
  abogado: "",
  concepto: "",
  control: "",
  totalTramite: "",
  totalPagado: "",
  totalImpuestos: "",
  valorAvaluo: "",
  totalGastosExtra: "",
  totalHonorarios: "",
});


  // Helpers
  const toNum = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;
  const restante = Math.max(0, toNum(f.totalTramite) - toNum(f.totalPagado));

  // Validación
  const errors = {};
  if (!f.fecha) errors.fecha = "Requerido";
  if (!f.recibiDe.trim()) errors.recibiDe = "Requerido";
  if (!f.totalTramite || isNaN(toNum(f.totalTramite))) errors.totalTramite = "Inválido";
  if (!f.totalPagado || isNaN(toNum(f.totalPagado))) errors.totalPagado = "Inválido";
  // Para protocolito, pedimos número
  if (f.tipoTramite === "Protocolito" && !f.control.trim()) errors.control = "Requerido";

  // Guardar en BD y luego mostrar vista previa para imprimir/guardar PDF
  const onSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(errors).length) return;

    try {
      setSaving(true);
      setSaveError("");
      setSavedId("");

      const payload = {
        fecha: f.fecha,
        tipoTramite: f.tipoTramite,
        recibiDe: f.recibiDe,
        abogado: f.abogado || '',
        abogadoId: abogadoId ? Number(abogadoId) : undefined, 
        concepto: f.concepto || "",
        // en Protocolito 'control' es el # Trámite
        control: f.control || null,
        totalTramite: toNum(f.totalTramite),
        totalPagado: toNum(f.totalPagado),
        restante,

        // aunque los ocultaste para protocolito, pueden ir en 0
        totalImpuestos: toNum(f.totalImpuestos),
        valorAvaluo: toNum(f.valorAvaluo),
        totalGastosExtra: toNum(f.totalGastosExtra),
        totalHonorarios: toNum(f.totalHonorarios),
      };

      const { data } = await axios.post(
        SAVE_URL,
        payload /* , { headers: { Authorization: `Bearer ${token}` } } */
      );

      const id = data?.data?._id;
      if (id) setSavedId(id);

      if (data?.pdfUrl) {
        const href = `${API}${
          data.pdfUrl.startsWith("/") ? data.pdfUrl : `/${data.pdfUrl}`
        }`;
        window.open(href, "_blank", "noopener,noreferrer");
      }

      // si quieres además mostrar el modal de vista previa:
      // setShowPrev(true);
    } catch (err) {
      setSaveError(
        err.response?.data?.msg ||
          err.response?.data?.mensaje ||
          err.message ||
          "No se pudo guardar el recibo"
      );
    } finally {
      setSaving(false);
    }
  };

  // Etiqueta del campo "control" según tipo
  const controlLabel =
    f.tipoTramite === "Protocolito" ? "# Trámite *" : "Control";

  return (
    <div className="rn17">
      <div className="recibo-wrap">
        <h1>Recibo Notaría 17</h1>

        <form className="card" onSubmit={onSubmit}>
          <div className="grid-2">
            <Field label="Fecha *" error={errors.fecha}>
              <input
                type="date"
                value={f.fecha}
                onChange={(e) => setF({ ...f, fecha: e.target.value })}
              />
            </Field>

            <Field label="Tipo de trámite">
              <select
                value={f.tipoTramite}
                onChange={(e) => {
                  const next = e.target.value;

                  // limpiar todo el formulario para el nuevo tipo
                  setF((prev) => resetFormForType(next, prev.fecha));

                  // resetear selects/flags relacionados
                  setNumeroSel("");
                  setConceptoTouched(false);
                  setSavedId("");
                  setSaveError("");
                     setAbogadoId('');
                  // si quieres volver a cargar números al regresar a Protocolito,
                  // puedes también hacer: loadedOnce.current = false;
                }}
              >
                <option value="Protocolito">Protocolito</option>
                <option value="Escritura">Escritura</option>
                <option value="Contrato">Contrato</option>
                <option value="Otro">Otro</option>
              </select>
            </Field>

            {f.tipoTramite === "Protocolito" && (
              <Field label="Número de Protocolito" className="span-2">
                <select
                  value={numeroSel}
                  onChange={(e) => handleSelectNumero(e.target.value)}
                >
                  <option value="">
                    {numsLoading ? "Cargando..." : "Selecciona..."}
                  </option>
                  {protocolitos.map((p) => (
                    <option key={p.numeroTramite} value={p.numeroTramite}>
                      #{p.numeroTramite} — {p.cliente ?? "Sin cliente"}
                      {p.abogado ? ` · ${p.abogado}` : ""}
                      {p.tipoTramite ? ` · ${p.tipoTramite}` : ""}
                    </option>
                  ))}
                </select>
                {numsError && (
                  <small style={{ color: "#ff6b6b" }}>{numsError}</small>
                )}
              </Field>
            )}

            <Field label="Recibí de *" error={errors.recibiDe} className="span-2">
              <input
                value={f.recibiDe}
                onChange={(e) => setF({ ...f, recibiDe: e.target.value })}
              />
            </Field>

            <Field label="Abogado Responsable">
              <select
                value={abogadoId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAbogadoId(id);
                  const found = catalogAbogados.find(a => String(a.id) === String(id));
                  setF(prev => ({ ...prev, abogado: found ? found.nombre : '' })); // nombre visible
                }}
              >
                <option value="">{loadingAbogados ? 'Cargando…' : 'Selecciona…'}</option>
                {catalogAbogados.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} {a.role === 'ASISTENTE' ? '· Asistente' : ''}
                    {a.disponible === false ? ' (no disponible)' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Concepto" className="span-2">
              <input
                value={f.concepto}
                onChange={(e) => {
                  setConceptoTouched(true); // marca que el usuario ya lo editó
                  setF({ ...f, concepto: e.target.value });
                }}
              />
            </Field>

            <Field label={controlLabel} error={errors.control}>
              <input
                value={f.control}
                onChange={(e) => setF({ ...f, control: e.target.value })}
                placeholder={f.tipoTramite === "Protocolito" ? "Ej. 11232" : ""}
              />
            </Field>

            <Field label="Total del Trámite *" error={errors.totalTramite}>
              <MoneyInput
                value={f.totalTramite}
                onChange={(v) => setF({ ...f, totalTramite: v })}
              />
            </Field>

            <Field label="Total Pagado *" error={errors.totalPagado}>
              <MoneyInput
                value={f.totalPagado}
                onChange={(v) => setF({ ...f, totalPagado: v })}
              />
            </Field>

            <Field label="Restante (auto)">
              <input
                value={restante.toLocaleString("es-MX", {
                  minimumFractionDigits: 2,
                })}
                readOnly
              />
            </Field>

            {/* Los 4 siguientes se ocultan visualmente para Protocolito; 
                para otros tipos puedes mostrarlos si los necesitas */}
            {/* Ocultar para Protocolito y Contrato; mostrar en los demás tipos */}
              {!["Protocolito", "Contrato","Otro"].includes(f.tipoTramite) && (
                <>
                  <Field label="Total Impuestos (sistema)">
                    <MoneyInput
                      value={f.totalImpuestos}
                      onChange={(v) => setF({ ...f, totalImpuestos: v })}
                      
                    />
                  </Field>

                  <Field label="Valor Avalúo (sistema)">
                    <MoneyInput
                      value={f.valorAvaluo}
                      onChange={(v) => setF({ ...f, valorAvaluo: v })}
                     
                    />
                  </Field>

                  <Field label="Total Gastos Extra (sistema)">
                    <MoneyInput
                      value={f.totalGastosExtra}
                      onChange={(v) => setF({ ...f, totalGastosExtra: v })}
                     
                    />
                  </Field>

                  <Field label="Total Honorarios (sistema)">
                    <MoneyInput
                      value={f.totalHonorarios}
                      onChange={(v) => setF({ ...f, totalHonorarios: v })}
                      
                    />
                  </Field>
                </>
              )}

          </div>

          {saveError && (
            <div className="alert-err" style={{ marginTop: 10 }}>
              {saveError}
            </div>
          )}

          <div className="actions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar y generar PDF"}
            </button>
          </div>
        </form>

        {showPrev && (
          <Preview
            onClose={() => setShowPrev(false)}
            data={{ ...f, restante, savedId }}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Subcomponentes ---------- */

function Field({ label, error, children, className }) {
  return (
    <div className={`field ${error ? "err" : ""} ${className || ""}`}>
      <label>{label}</label>
      {children}
      {error && <small>{error}</small>}
    </div>
  );
}

function MoneyInput({ value, onChange, readOnly }) {
  const raw = String(value ?? "");
  const num = raw === "" ? "" : Number(raw.replace(/[^0-9.]/g, "")) || "";
  return (
    <input
      inputMode="decimal"
      value={raw}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onChange(num === "" ? "" : num.toFixed(2))}
      placeholder="0.00"
      readOnly={readOnly}
    />
  );
}

function Preview({ onClose, data }) {
  const bloques = [false, true];
  const monto = (n) =>
    `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {bloques.map((copia, i) => (
          <div className="recibo" key={i}>
            <header>
              <h2>Notaría 17</h2>
              <span>{copia ? "COPIA" : "ORIGINAL"}</span>
            </header>

            {/* Si el backend devolvió un ID/folio, lo mostramos */}
            {data.savedId && (
              <div className="row">
                <b>Folio:</b><span>{data.savedId}</span>
              </div>
            )}

            <div className="row"><b>Fecha:</b><span>{data.fecha}</span></div>
            <div className="row"><b>Tipo de trámite:</b><span>{data.tipoTramite}</span></div>
            <div className="row"><b>Recibí de:</b><span>{data.recibiDe}</span></div>
            <div className="row"><b>Abogado Responsable:</b><span>{data.abogado || "—"}</span></div>
            <div className="row"><b>Concepto:</b><span>{data.concepto || "—"}</span></div>

            {/* Etiqueta según tipo */}
            <div className="row">
              <b>{data.tipoTramite === "Protocolito" ? "# Trámite:" : "Control:"}</b>
              <span>{data.control || "—"}</span>
            </div>

            <div className="row"><b>Total del Trámite:</b><span>{monto(data.totalTramite)}</span></div>
            <div className="row"><b>Total Pagado:</b><span>{monto(data.totalPagado)}</span></div>
            <div className="row"><b>Restante:</b><span>{monto(data.restante)}</span></div>

            <div className="firmas">
              <div><div className="line" /><small>Recibí conforme</small></div>
              <div><div className="line" /><small>Notaría 17</small></div>
            </div>
          </div>
        ))}

        <div className="sheet-actions no-print">
          <button className="btn" onClick={onClose}>Cerrar</button>
          <button className="btn primary" onClick={() => window.print()}>
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
