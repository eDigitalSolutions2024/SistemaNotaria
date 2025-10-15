// frontend/src/components/ReciboNotaria17.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "../css/ReciboNotaria17.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000";
const SAVE_URL = `${API}/recibos`;

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
    totalPagado: "",      // Escritura: pagado acumulado (solo lectura)
    abono: "",            // Escritura: abono del recibo actual
    totalImpuestos: "",
    valorAvaluo: "",
    totalGastosExtra: "",
    totalHonorarios: "",
  });

  const [conceptoTouched, setConceptoTouched] = useState(false);

  // catálogo de abogados
  const [catalogAbogados, setCatalogAbogados] = useState([]);
  const [loadingAbogados, setLoadingAbogados] = useState(false);
  const [abogadoId, setAbogadoId] = useState("");

  // protocolitos
  const [numsLoading, setNumsLoading] = useState(false);
  const [numsError, setNumsError] = useState("");
  const [protocolitos, setProtocolitos] = useState([]);
  const [numeroSel, setNumeroSel] = useState("");
  const loadedOnce = useRef(false);

  // estado guardado
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedId, setSavedId] = useState("");

  // Autocomplete Escrituras + Historial
  const [escSugs, setEscSugs] = useState([]);
  const [hist, setHist] = useState(null);
  const escSearchTimer = useRef(null);

  /* ---------------- Escritura: pendiente + historial ---------------- */

  async function loadEscrituraPendiente() {
    const numero = String(f.control || "").trim();
    if (!numero) return;
    try {
      setSaving(true);
      const { data } = await axios.get(
        `${API}/recibos/escrituras/${encodeURIComponent(numero)}/pending`
      );
      const info = data?.data || null;
      if (!info) {
        setHist(null);
        return;
      }

      setF((prev) => {
        const keepConcept = conceptoTouched && prev.concepto.trim();
        const total = Number(info.totalTramite ?? 0);
        const pagAc = Number(info.pagadoAcum ?? 0);
        const restanteSugerido = Math.max(0, total - pagAc);
        const rec = info.last || {};
        return {
          ...prev,
          tipoTramite: "Escritura",
          control: info.control,
          concepto: keepConcept ? prev.concepto : "Pago de Escritura",
          totalTramite: String(info.totalTramite ?? ""),
          totalPagado: String(info.pagadoAcum ?? ""), // acumulado (readOnly)
          abono: String(restanteSugerido),            // sugerencia (editable)
          recibiDe: rec.recibiDe || prev.recibiDe,
          abogado: rec.abogado || prev.abogado,
          // “de sistema” desde el último recibo si existen
          totalImpuestos: String(rec.totalImpuestos ?? ""),
          valorAvaluo: String(rec.valorAvaluo ?? ""),
          totalGastosExtra: String(rec.totalGastosExtra ?? ""),
          totalHonorarios: String(rec.totalHonorarios ?? ""),
        };
      });

      if (info.last?.abogado) {
        const found = catalogAbogados.find(
          (a) => (a.nombre || "").trim() === (info.last.abogado || "").trim()
        );
        if (found) setAbogadoId(String(found.id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function loadEscrituraHistorial() {
    const numero = String(f.control || "").trim();
    if (!numero) {
      setHist(null);
      return;
    }
    try {
      const { data } = await axios.get(
        `${API}/recibos/escrituras/${encodeURIComponent(numero)}/history`
      );
      setHist(data?.data || null);
    } catch (e) {
      console.error("HIST ERROR:", e);
      setHist(null);
    }
  }

  /* ---------------- cat. abogados / protocolitos ---------------- */

  useEffect(() => {
    let alive = true;
    setLoadingAbogados(true);
    axios
      .get(`${API}/recibos/abogados`)
      .then(({ data }) => {
        if (!alive) return;
        const list = Array.isArray(data?.data) ? data.data : [];
        setCatalogAbogados(list);
      })
      .catch((err) => console.error("CAT ABOGADOS ERR:", err))
      .finally(() => {
        if (alive) setLoadingAbogados(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (f.tipoTramite !== "Protocolito") return;
    if (loadedOnce.current) return;
    setNumsLoading(true);
    setNumsError("");
    axios
      .get(`${API}/recibos/protocolitos/numeros`)
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

  /* ---------------- autollenado de concepto ---------------- */

  useEffect(() => {
    if (conceptoTouched) return;
    const ya = String(f.concepto || "").trim().length > 0;
    if (ya) return;
    if (f.tipoTramite === "Protocolito") return;

    let base = "";
    if (f.tipoTramite === "Escritura") base = "Pago de Escritura";
    else if (f.tipoTramite === "Contrato") base = "Pago de Contrato";
    else base = "Pago de trámite";
    setF((prev) => ({ ...prev, concepto: base }));
  }, [f.tipoTramite, conceptoTouched]);

  /* ---------------- seleccionar protocolito ---------------- */

  async function handleSelectNumero(value) {
    setNumeroSel(value);
    if (!value) return;

    try {
      const { data } = await axios.get(
        `${API}/recibos/protocolitos/${encodeURIComponent(value)}`
      );
      const d = data?.data || {};

      setF((prev) => {
        const motivoPlano =
          d.tipoTramite || d.motivo || d.servicio || d.accion || "";
        const conceptoPlantilla = motivoPlano
          ? `Pago de ${motivoPlano} con número de Protocolito #${d.numeroTramite}`
          : d.numeroTramite
          ? `Pago de trámite Protocolito #${d.numeroTramite}`
          : "Pago de trámite Protocolito";

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

      const found = catalogAbogados.find(
        (a) => (a.nombre || "").trim() === (d.abogado || "").trim()
      );
      if (found) setAbogadoId(String(found.id));
    } catch (e) {
      alert(e.response?.data?.msg || e.message || "Error");
    }
  }

  /* ---------------- helpers / validación / submit ---------------- */

  const resetFormForType = (tipo, keepFecha) => ({
    fecha: keepFecha || hoy,
    tipoTramite: tipo,
    recibiDe: "",
    abogado: "",
    concepto: "",
    control: "",
    totalTramite: "",
    totalPagado: "",
    abono: "",
    totalImpuestos: "",
    valorAvaluo: "",
    totalGastosExtra: "",
    totalHonorarios: "",
  });

  const toNum = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;

  const isEscritura = f.tipoTramite === "Escritura";
  const hasPrevEscritura =
    isEscritura && Array.isArray(hist?.items) && hist.items.length > 0;

  // Escritura: pagado acumulado (desde historial/pending)
  const pagadoAcum = isEscritura ? toNum(f.totalPagado) : 0;
  const maxAbono = Math.max(0, toNum(f.totalTramite) - pagadoAcum);

  // Pago actual (clamp)
  const pagoActual = isEscritura
    ? Math.min(toNum(f.abono), maxAbono)
    : Math.min(toNum(f.totalPagado), toNum(f.totalTramite));

  // Restante
  const restante = Math.max(0, toNum(f.totalTramite) - (pagadoAcum + pagoActual));

  // Validaciones
  const errors = {};
  if (!f.fecha) errors.fecha = "Requerido";
  if (!f.recibiDe.trim()) errors.recibiDe = "Requerido";
  if (!f.totalTramite || isNaN(toNum(f.totalTramite))) errors.totalTramite = "Inválido";

  if (isEscritura) {
    if (!f.abono || isNaN(toNum(f.abono))) {
      errors.abono = "Inválido";
    } else if (toNum(f.abono) > maxAbono) {
      errors.abono = `No puedes abonar más de $${maxAbono.toFixed(2)}`;
    }
  } else {
    if (!f.totalPagado || isNaN(toNum(f.totalPagado))) {
      errors.totalPagado = "Inválido";
    } else if (toNum(f.totalPagado) > toNum(f.totalTramite)) {
      errors.totalPagado = "No puedes pagar más que el total del trámite";
    }
  }

  if (f.tipoTramite === "Protocolito" && !f.control.trim()) {
    errors.control = "Requerido";
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(errors).length) return;

    try {
      setSaving(true);
      setSaveError("");
      setSavedId("");

      const abonoNum = isEscritura ? Math.min(toNum(f.abono), maxAbono) : 0;
      const totalPagadoEnviar = isEscritura
        ? abonoNum
        : Math.min(toNum(f.totalPagado), toNum(f.totalTramite));

      const payload = {
        fecha: f.fecha,
        tipoTramite: f.tipoTramite,
        recibiDe: f.recibiDe,
        abogado: f.abogado || "",
        abogadoId: abogadoId ? Number(abogadoId) : undefined,
        concepto: f.concepto || "",
        control: f.control || null,
        totalTramite: toNum(f.totalTramite),
        totalPagado: totalPagadoEnviar,
        abono: isEscritura ? abonoNum : undefined,
        restante,
        totalImpuestos: toNum(f.totalImpuestos),
        valorAvaluo: toNum(f.valorAvaluo),
        totalGastosExtra: toNum(f.totalGastosExtra),
        totalHonorarios: toNum(f.totalHonorarios),
      };

      const { data } = await axios.post(SAVE_URL, payload);
      const id = data?.data?._id;
      if (id) setSavedId(id);

      if (data?.pdfUrl) {
        const href = `${API}${
          data.pdfUrl.startsWith("/") ? data.pdfUrl : `/${data.pdfUrl}`
        }`;
        window.open(href, "_blank", "noopener,noreferrer");
      }
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

  /* ---------------- control label/placeholder ---------------- */

  const controlLabel =
    f.tipoTramite === "Protocolito"
      ? "# Trámite *"
      : isEscritura
      ? "Número de Escritura"
      : "Control";

  const controlPlaceholder =
    f.tipoTramite === "Protocolito"
      ? "Ej. 11232"
      : isEscritura
      ? "Ej. 2024/0001"
      : "";

  /* ---------------- autocomplete escrituras ---------------- */

  useEffect(() => {
    if (!isEscritura) {
      setEscSugs([]);
      return;
    }
    const q = String(f.control || "").trim();
    if (escSearchTimer.current) clearTimeout(escSearchTimer.current);
    if (q.length < 2) {
      setEscSugs([]);
      return;
    }
    escSearchTimer.current = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API}/recibos/escrituras/search`, {
          params: { q },
        });
        const list = Array.isArray(data?.data) ? data.data : [];
        setEscSugs(list.slice(0, 20));
      } catch {
        setEscSugs([]);
      }
    }, 220);
  }, [f.control, f.tipoTramite]); // eslint-disable-line

  const onBlurControlEscritura = async () => {
    if (!isEscritura) return;
    await loadEscrituraPendiente();
    await loadEscrituraHistorial();
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
                onChange={(e) => {
                  const next = e.target.value;
                  setF((prev) => resetFormForType(next, prev.fecha));
                  setNumeroSel("");
                  setConceptoTouched(false);
                  setSavedId("");
                  setSaveError("");
                  setAbogadoId("");
                  setEscSugs([]);
                  setHist(null);
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
                  const found = catalogAbogados.find(
                    (a) => String(a.id) === String(id)
                  );
                  setF((prev) => ({ ...prev, abogado: found ? found.nombre : "" }));
                }}
              >
                <option value="">
                  {loadingAbogados ? "Cargando…" : "Selecciona…"}
                </option>
                {catalogAbogados.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} {a.role === "ASISTENTE" ? "· Asistente" : ""}
                    {a.disponible === false ? " (no disponible)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Concepto" className="span-2">
              <input
                value={f.concepto}
                onChange={(e) => {
                  setConceptoTouched(true);
                  setF({ ...f, concepto: e.target.value });
                }}
              />
            </Field>

            <Field label={controlLabel} error={errors.control}>
              <input
                value={f.control}
                onChange={(e) => setF({ ...f, control: e.target.value })}
                onBlur={onBlurControlEscritura}
                placeholder={controlPlaceholder}
                list={isEscritura ? "escrituras-suggest" : undefined}
              />
              {isEscritura && (
                <datalist id="escrituras-suggest">
                  {escSugs.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
              {isEscritura && hist && (
                <small style={{ display: "block", marginTop: 6, lineHeight: 1.4 }}>
                  <b>Historial:</b>{" "}
                  Total: $
                  {Number(hist.totalTramite || hist.totalTramiteBase || 0).toLocaleString(
                    "es-MX",
                    { minimumFractionDigits: 2 }
                  )}
                  {" · "}Pagado: $
                  {Number(hist.pagadoAcum || 0).toLocaleString("es-MX", {
                    minimumFractionDigits: 2,
                  })}
                  {" · "}Restante: $
                  {Number(hist.restante || 0).toLocaleString("es-MX", {
                    minimumFractionDigits: 2,
                  })}
                  {Array.isArray(hist.items) && hist.items.length > 0 && (
                    <>
                      <br />
                      {hist.items.map((r, i) => (
                        <span key={r._id} style={{ marginRight: 10 }}>
                          #{r.numeroRecibo}{" "}
                          <a
                            href={`${API}${r.pdfUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir PDF del recibo"
                          >
                            PDF
                          </a>
                          {i < hist.items.length - 1 ? " | " : ""}
                        </span>
                      ))}
                    </>
                  )}
                </small>
              )}
            </Field>

            <Field label="Total del Trámite *" error={errors.totalTramite}>
              <MoneyInput
                value={f.totalTramite}
                onChange={(v) => setF({ ...f, totalTramite: v })}
                readOnly={isEscritura && hasPrevEscritura} // ← BLOQUEA desde el 2º recibo
              />
            </Field>

            {/* Escritura: acumulado (readOnly) + Abono */}
            {isEscritura ? (
              <>
                <Field label="Total Pagado (acumulado)">
                  <MoneyInput value={f.totalPagado} onChange={() => {}} readOnly />
                </Field>

                <Field label="Abono (este recibo) *" error={errors.abono}>
                  <MoneyInput
                    value={f.abono}
                    onChange={(v) => {
                      const n = toNum(v);
                      const clamped = Math.min(n, maxAbono);
                      setF({ ...f, abono: String(clamped) });
                    }}
                  />
                  <small style={{ display: "block", marginTop: 4, opacity: 0.75 }}>
                    Máximo permitido: $
                    {maxAbono.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </small>
                </Field>
              </>
            ) : (
              // Otros tipos
              <Field label="Total Pagado *" error={errors.totalPagado}>
                <MoneyInput
                  value={f.totalPagado}
                  onChange={(v) => {
                    const n = toNum(v);
                    const clamped = Math.min(n, toNum(f.totalTramite));
                    setF({ ...f, totalPagado: String(clamped) });
                  }}
                />
              </Field>
            )}

            <Field label="Restante (auto)">
              <input
                value={restante.toLocaleString("es-MX", {
                  minimumFractionDigits: 2,
                })}
                readOnly
              />
            </Field>

            {/* Campos “sistema” solo para Escritura (como tenías) */}
            {!["Protocolito", "Contrato", "Otro"].includes(f.tipoTramite) && (
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

  const controlLabelPreview =
    data.tipoTramite === "Protocolito"
      ? "# Trámite:"
      : data.tipoTramite === "Escritura"
      ? "Número de Escritura:"
      : "Control:";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {bloques.map((copia, i) => (
          <div className="recibo" key={i}>
            <header>
              <h2>Notaría 17</h2>
              <span>{copia ? "COPIA" : "ORIGINAL"}</span>
            </header>

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

            <div className="row">
              <b>{controlLabelPreview}</b>
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
