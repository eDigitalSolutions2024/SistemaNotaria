import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import API_URL from "../api";
import "../css/ReciboNotaria17.css";

export default function ReciboNotaria17() {
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [showPrev, setShowPrev] = useState(false);

  const [f, setF] = useState({
    fecha: hoy,
    tipoTramite: "Protocolito",
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

  // lista y selección de protocolitos
  const [numsLoading, setNumsLoading] = useState(false);
  const [numsError, setNumsError] = useState("");
  const [protocolitos, setProtocolitos] = useState([]);
  const [numeroSel, setNumeroSel] = useState("");
  const loadedOnce = useRef(false);

  // Cargar TODOS los números cuando el tipo sea Protocolito (una sola vez)
  useEffect(() => {
    if (f.tipoTramite !== "Protocolito") return;
    if (loadedOnce.current) return;

    setNumsLoading(true);
    setNumsError("");
    axios
      .get(`http://localhost:8020/api/recibos/protocolitos/numeros`)
      .then(({ data }) => {
        setProtocolitos(data?.data || []);
        loadedOnce.current = true;
      })
      .catch((e) =>
        setNumsError(
          e.response?.data?.msg || e.message || "Error cargando números"
        )
      )
      .finally(() => setNumsLoading(false));
  }, [f.tipoTramite]);

  // Al cambiar el número, traemos el detalle y autorrellenamos
  async function handleSelectNumero(value) {
    setNumeroSel(value);
    if (!value) return;
    try {
      const { data } = await axios.get(
        `${API_URL}/recibos/protocolitos/${value}`
      );
      const d = data?.data || {};
      setF((prev) => ({
        ...prev,
        fecha: d.fecha ? String(d.fecha).slice(0, 10) : prev.fecha,
        recibiDe: d.cliente || prev.recibiDe,
        abogado: d.abogado || prev.abogado,
        control: d.numeroTramite ? String(d.numeroTramite) : prev.control,
        concepto:
          prev.concepto ||
          (d.numeroTramite
            ? `Pago de trámite Protocolito #${d.numeroTramite}`
            : "Pago de trámite Protocolito"),
      }));
    } catch (e) {
      alert(e.response?.data?.msg || e.message);
    }
  }

  // validación y submit
  const toNum = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;
  const restante = Math.max(0, toNum(f.totalTramite) - toNum(f.totalPagado));

  const errors = {};
  if (!f.fecha) errors.fecha = "Requerido";
  if (!f.recibiDe.trim()) errors.recibiDe = "Requerido";
  if (!f.totalTramite || isNaN(toNum(f.totalTramite))) errors.totalTramite = "Inválido";
  if (!f.totalPagado || isNaN(toNum(f.totalPagado))) errors.totalPagado = "Inválido";

  const onSubmit = (e) => {
    e.preventDefault();
    if (Object.keys(errors).length) return;
    setShowPrev(true);
  };

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
                onChange={(e) => setF({ ...f, tipoTramite: e.target.value })}
              >
                <option value="Protocolito">Protocolito</option>
                <option value="Escritura">Escritura</option>
                <option value="Contrato">Contrato</option>
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
                value={f.abogado}
                onChange={(e) => setF({ ...f, abogado: e.target.value })}
              >
                <option value="">Selecciona… (demo)</option>
                <option>Lic. A</option>
                <option>Lic. B</option>
                <option>Lic. C</option>
              </select>
            </Field>

            <Field label="Concepto" className="span-2">
              <input
                value={f.concepto}
                onChange={(e) => setF({ ...f, concepto: e.target.value })}
              />
            </Field>

            <Field label="Control">
              <input
                value={f.control}
                onChange={(e) => setF({ ...f, control: e.target.value })}
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
                value={restante.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                readOnly
              />
            </Field>

            <Field label="Total Impuestos (sistema)">
              <MoneyInput
                value={f.totalImpuestos}
                onChange={(v) => setF({ ...f, totalImpuestos: v })}
                readOnly
              />
            </Field>

            <Field label="Valor Avalúo (sistema)">
              <MoneyInput
                value={f.valorAvaluo}
                onChange={(v) => setF({ ...f, valorAvaluo: v })}
                readOnly
              />
            </Field>

            <Field label="Total Gastos Extra (sistema)">
              <MoneyInput
                value={f.totalGastosExtra}
                onChange={(v) => setF({ ...f, totalGastosExtra: v })}
                readOnly
              />
            </Field>

            <Field label="Total Honorarios (sistema)">
              <MoneyInput
                value={f.totalHonorarios}
                onChange={(v) => setF({ ...f, totalHonorarios: v })}
                readOnly
              />
            </Field>
          </div>

          <div className="actions">
            <button className="btn primary" type="submit">Generar</button>
          </div>
        </form>

        {showPrev && <Preview onClose={() => setShowPrev(false)} data={{ ...f, restante }} />}
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
  const monto = (n) => `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {bloques.map((copia, i) => (
          <div className="recibo" key={i}>
            <header>
              <h2>Notaría 17</h2>
              <span>{copia ? "COPIA" : "ORIGINAL"}</span>
            </header>
            <div className="row"><b>Fecha:</b><span>{data.fecha}</span></div>
            <div className="row"><b>Tipo de trámite:</b><span>{data.tipoTramite}</span></div>
            <div className="row"><b>Recibí de:</b><span>{data.recibiDe}</span></div>
            <div className="row"><b>Abogado Responsable:</b><span>{data.abogado || "—"}</span></div>
            <div className="row"><b>Concepto:</b><span>{data.concepto || "—"}</span></div>
            <div className="row"><b>Control:</b><span>{data.control || "—"}</span></div>
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
          <button className="btn primary" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
    </div>
  );
}
