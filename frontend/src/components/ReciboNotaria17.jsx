// frontend/src/components/ReciboNotaria17.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "../css/ReciboNotaria17.css";
import { useAuth } from "../auth/AuthContext";


const API = process.env.REACT_APP_API_URL || "http://localhost:4000";
const SAVE_URL = `${API}/recibos`;

export default function ReciboNotaria17({ row }) {


  const { token } = useAuth();

  const authCfg = useMemo(() => ({
    headers: { Authorization: `Bearer ${token}` }
  }), [token]);


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
    /*totalImpuestos: "",
    valorAvaluo: "",
    totalGastosExtra: "",
    totalHonorarios: "",*/
  });

  const [conceptoTouched, setConceptoTouched] = useState(false);

  // catálogo de abogados
  const [catalogAbogados, setCatalogAbogados] = useState([]);
  const [loadingAbogados, setLoadingAbogados] = useState(false);
  const [abogadoId, setAbogadoId] = useState("");

  // protocolitos (select)
  const [numsLoading, setNumsLoading] = useState(false);
  const [numsError, setNumsError] = useState("");
  const [protocolitos, setProtocolitos] = useState([]);
  const [numeroSel, setNumeroSel] = useState("");
  const loadedOnce = useRef(false);

  // escrituras (select)
  const [escLoading, setEscLoading] = useState(false);
  const [escError, setEscError] = useState("");
  const [escrituras, setEscrituras] = useState([]);
  const [escNumeroSel, setEscNumeroSel] = useState("");
  const loadedOnceEsc = useRef(false);

  // estado guardado
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedId, setSavedId] = useState("");

  // Autocomplete Escrituras + Historial (se mantiene por si escriben manualmente)
  const [escSugs, setEscSugs] = useState([]);
  const [hist, setHist] = useState(null);
  const escSearchTimer = useRef(null);

  /* ---------------- Escritura: pendiente + historial ---------------- */

  async function loadEscrituraPendiente(numeroOverride) {
    const numero = String(numeroOverride ?? f.control ?? "").trim();
    if (!numero) return;
    try {
      setSaving(true);
      const { data } = await axios.get(
        `${API}/recibos/escrituras/${encodeURIComponent(numero)}/pending`,
        authCfg
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
          control: String(info.control ?? ""),
          concepto: keepConcept ? prev.concepto : "Pago de Escritura",
          totalTramite: String(info.totalTramite ?? ""),
          totalPagado: String(info.pagadoAcum ?? ""), // acumulado (readOnly)
          abono: String(restanteSugerido),            // sugerencia (editable)
          recibiDe: rec.recibiDe || prev.recibiDe,
          abogado: rec.abogado || prev.abogado,
          // “de sistema” desde el último recibo si existen
          /*totalImpuestos: String(rec.totalImpuestos ?? ""),
          valorAvaluo: String(rec.valorAvaluo ?? ""),
          totalGastosExtra: String(rec.totalGastosExtra ?? ""),
          totalHonorarios: String(rec.totalHonorarios ?? ""),*/
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

  async function loadEscrituraHistorial(numeroOverride) {
    const numero = String(numeroOverride ?? f.control ?? "").trim();
    if (!numero) {
      setHist(null);
      return;
    }
    try {
      const { data } = await axios.get(
      `${API}/recibos/escrituras/${encodeURIComponent(numero)}/history`,
      authCfg
    );
      setHist(data?.data || null);
    } catch (e) {
      console.error("HIST ERROR:", e);
      setHist(null);
    }
  }

  /* ---------------- Protocolito: pendiente + historial ---------------- */

  async function loadProtocolitoPendiente(numeroOverride) {
    const numero = String(numeroOverride ?? f.control ?? "").trim();
    if (!numero) return;
    try {
      setSaving(true);
      const { data } = await axios.get(
        `${API}/recibos/protocolitos/${encodeURIComponent(numero)}/pending`,
        authCfg
      );
      const info = data?.data || null;
      if (!info) return; // sin recibos previos: el total lo teclea la recepcionista

      setF((prev) => {
        const keepConcept = conceptoTouched && prev.concepto.trim();
        const total = Number(info.totalTramite ?? 0);
        const pagAc = Number(info.pagadoAcum ?? 0);
        const restanteSugerido = Math.max(0, total - pagAc);
        const rec = info.last || {};
        return {
          ...prev,
          tipoTramite: "Protocolito",
          control: String(info.control ?? ""),
          concepto: keepConcept ? prev.concepto : "Pago de Protocolito",
          totalTramite: String(info.totalTramite ?? ""),
          totalPagado: String(info.pagadoAcum ?? ""), // acumulado (readOnly)
          abono: String(restanteSugerido),            // sugerencia (editable)
          recibiDe: rec.recibiDe || prev.recibiDe,
          abogado: rec.abogado || prev.abogado,
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

  async function loadProtocolitoHistorial(numeroOverride) {
    const numero = String(numeroOverride ?? f.control ?? "").trim();
    if (!numero) {
      setHist(null);
      return;
    }
    try {
      const { data } = await axios.get(
        `${API}/recibos/protocolitos/${encodeURIComponent(numero)}/history`,
        authCfg
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

  /* ---------------- ESCRITURAS: lista (igual que protocolito) ---------------- */

  useEffect(() => {
    if (f.tipoTramite !== "Escritura") return;
    if (loadedOnceEsc.current) return;
    setEscLoading(true);
    setEscError("");
    axios
      .get(`${API}/recibos/escrituras/numeros`)
      .then(({ data }) => {
        const list = Array.isArray(data?.data) ? data.data : [];
        // Esperado: [{ numeroControl, cliente, abogado, tipoTramite, fecha? }]
        setEscrituras(list);
        loadedOnceEsc.current = true;
      })
      .catch((e) => {
        const msg = e.response?.data?.msg || e.message || "Network Error";
        setEscError(msg);
      })
      .finally(() => setEscLoading(false));
  }, [f.tipoTramite]);

  async function handleSelectEscritura(value) {
    setEscNumeroSel(value);
    if (!value) return;

    // value = numeroControl
    const selected =
      escrituras.find((x) => String(x.numeroControl) === String(value)) || null;

    setF((prev) => {
      const motivoPlano =
        selected?.tipoTramite || "Escritura";
      const conceptoPlantilla = `Pago de ${motivoPlano} con número de Escritura #${value}`;

      const keepUserConcept =
        conceptoTouched && String(prev.concepto || "").trim().length > 0;

      return {
        ...prev,
        tipoTramite: "Escritura",
        control: String(value),
        fecha: selected?.fecha ? String(selected.fecha).slice(0, 10) : prev.fecha,
        recibiDe: selected?.cliente || prev.recibiDe,
        abogado: selected?.abogado || prev.abogado,
        concepto: keepUserConcept ? prev.concepto : conceptoPlantilla,
      };
    });

    if (selected?.abogado) {
      const found = catalogAbogados.find(
        (a) => (a.nombre || "").trim() === (selected.abogado || "").trim()
      );
      if (found) setAbogadoId(String(found.id));
    }

    // carga pendiente + historial para autocompletar totales/abonos
    await loadEscrituraPendiente(value);
    await loadEscrituraHistorial(value);
  }

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
  `${API}/recibos/protocolitos/${encodeURIComponent(value)}`,
  authCfg
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

      // carga pendiente + historial para autocompletar totales/abonos
      const numero = d.numeroTramite ? String(d.numeroTramite) : String(value);
      await loadProtocolitoPendiente(numero);
      await loadProtocolitoHistorial(numero);
    } catch (e) {
      alert(e.response?.data?.msg || e.message || "Error");
    }
  }

  /* ---------------- precarga desde Escrituras/Protocolito ---------------- */
  // Cuando llegas aquí desde el botón "Generar recibo" (trámite sin recibo),
  // `row` trae { tipoTramite: 'Escritura'|'Protocolito', control }. Reusa el
  // mismo flujo que si lo hubieras seleccionado a mano en el <select>, para
  // no tener que volver a buscar cliente/abogado/montos.
  const cameFromTramite = !!row?.control;
  const tipoTramiteRow = row?.tipoTramite === "Protocolito" ? "Protocolito" : "Escritura";

  // Paso 1: en cuanto llega `row`, fija el tipo de trámite — eso es lo que
  // dispara (más abajo) la carga de la lista de escrituras/protocolitos.
  const prefillStartedRef = useRef(false);
  useEffect(() => {
    if (!cameFromTramite) return;
    if (prefillStartedRef.current) return;
    prefillStartedRef.current = true;
    setF((prev) => resetFormForType(tipoTramiteRow, prev.fecha));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameFromTramite]);

  // Paso 2: ya con el tipo fijado, espera a que exista lo necesario para
  // resolver cliente/abogado (catálogo de abogados siempre; para Escritura
  // además la lista, porque a diferencia de Protocolito no hay un endpoint
  // de "una sola escritura por número" — handleSelectEscritura busca en la
  // lista local) y entonces sí aplica la selección real.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!cameFromTramite) return;
    if (prefilledRef.current) return;
    if (loadingAbogados) return;
    if (tipoTramiteRow === "Escritura" && escrituras.length === 0) return;

    prefilledRef.current = true;
    const control = String(row.control).trim();

    if (tipoTramiteRow === "Protocolito") {
      handleSelectNumero(control);
    } else {
      handleSelectEscritura(control);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameFromTramite, loadingAbogados, escrituras]);

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
    /*totalImpuestos: "",
    valorAvaluo: "",
    totalGastosExtra: "",
    totalHonorarios: "",*/
  });

  const toNum = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;
  const fmtMoney = (v) =>
    Number(v || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });
  const fmtFecha = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX");
  };

  const isEscritura = f.tipoTramite === "Escritura";
  const isProto = f.tipoTramite === "Protocolito";
  // Escritura y Protocolito acumulan abonos hasta completar el total;
  // Contrato/Otro se cobran completos en un solo recibo.
  const usaAbono = isEscritura || isProto;
  const hasPrevPago =
    usaAbono && Array.isArray(hist?.items) && hist.items.length > 0;

  // pagado acumulado (desde historial/pending)
  const pagadoAcum = usaAbono ? toNum(f.totalPagado) : 0;
  const maxAbono = Math.max(0, toNum(f.totalTramite) - pagadoAcum);

  // Pago actual (clamp)
  const pagoActual = usaAbono
    ? Math.min(toNum(f.abono), maxAbono)
    : Math.min(toNum(f.totalPagado), toNum(f.totalTramite));

  // Restante
  const restante = Math.max(0, toNum(f.totalTramite) - (pagadoAcum + pagoActual));

  // Validaciones
  const errors = {};
  if (!f.fecha) errors.fecha = "Requerido";
  if (!f.recibiDe.trim()) errors.recibiDe = "Requerido";
  if (!f.totalTramite || isNaN(toNum(f.totalTramite))) errors.totalTramite = "Inválido";

  if (usaAbono) {
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

  if (f.tipoTramite === "Protocolito" && !String(f.control || "").trim()) {
    errors.control = "Requerido";
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(errors).length) return;

    try {
      setSaving(true);
      setSaveError("");
      setSavedId("");

      const abonoNum = usaAbono ? Math.min(toNum(f.abono), maxAbono) : 0;
      const totalPagadoEnviar = usaAbono
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
        abono: usaAbono ? abonoNum : undefined,
        restante,
        /*totalImpuestos: toNum(f.totalImpuestos),
        valorAvaluo: toNum(f.valorAvaluo),
        totalGastosExtra: toNum(f.totalGastosExtra),
        totalHonorarios: toNum(f.totalHonorarios),*/
      };

      const { data } = await axios.post(SAVE_URL, payload, authCfg);

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

  const controlLabel = isProto
    ? "# Trámite *"
    : isEscritura
    ? "Número de Escritura *"
    : "Control";

  const controlPlaceholder = isProto
    ? "Ej. 11232"
    : isEscritura
    ? "Ej. 2024/0001"
    : "";

  /* ---------------- autocomplete escrituras (se mantiene) ---------------- */

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
  ...authCfg,
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
                  setEscNumeroSel("");
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

            {/* ======= SELECT: Protocolito ======= */}
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

            {/* ======= SELECT: Escritura (nuevo, igual que Protocolito) ======= */}
            {f.tipoTramite === "Escritura" && (
              <Field label="Número de Escritura" className="span-2">
                <select
                  value={escNumeroSel}
                  onChange={(e) => handleSelectEscritura(e.target.value)}
                >
                  <option value="">
                    {escLoading ? "Cargando..." : "Selecciona..."}
                  </option>
                  {escrituras.map((e1) => (
                    <option key={e1.numeroControl} value={e1.numeroControl}>
                      #{e1.numeroControl} — {e1.cliente ?? "Sin cliente"}
                      {e1.abogado ? ` · ${e1.abogado}` : ""}
                      {e1.tipoTramite ? ` · ${e1.tipoTramite}` : ""}
                    </option>
                  ))}
                </select>
                {escError && (
                  <small style={{ color: "#ff6b6b" }}>{escError}</small>
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
                disabled={cameFromTramite}
                title={cameFromTramite ? "El abogado del trámite no se puede cambiar aquí" : undefined}
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
              {cameFromTramite && (
                <small style={{ display: "block", marginTop: 4, opacity: 0.75 }}>
                  Fijo al abogado del trámite #{row?.control}.
                </small>
              )}
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

            {/* Campo manual (se mantiene); con datalist y blur para cargar hist */}
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
            </Field>

            {usaAbono && hist && (
              <div className="span-2 historial-panel">
                {(() => {
                  const total = Number(hist.totalTramite ?? hist.totalTramiteBase ?? 0);
                  const pagado = Number(hist.pagadoAcum || 0);
                  const restante = Number(hist.restante || 0);
                  const liquidado = restante <= 0 && total > 0;
                  const pct = total > 0 ? Math.min(100, (pagado / total) * 100) : 0;
                  const items = Array.isArray(hist.items) ? hist.items : [];

                  return (
                    <>
                      <div className="historial-header">
                        <span className="historial-title">
                          Historial de pagos · {isEscritura ? "Escritura" : "Protocolito"} #{f.control}
                        </span>
                        <span className={`historial-badge ${liquidado ? "ok" : "pending"}`}>
                          {liquidado ? "Liquidado" : "Pendiente de pago"}
                        </span>
                      </div>

                      <div className="historial-stats">
                        <div className="stat">
                          <span className="stat-label">Total del trámite</span>
                          <span className="stat-value">${fmtMoney(total)}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Pagado</span>
                          <span className="stat-value ok">${fmtMoney(pagado)}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Restante</span>
                          <span className={`stat-value ${liquidado ? "ok" : "pending"}`}>
                            ${fmtMoney(restante)}
                          </span>
                        </div>
                      </div>

                      <div className="historial-progress" title={`${pct.toFixed(0)}% pagado`}>
                        <div
                          className={`historial-progress-bar ${liquidado ? "ok" : ""}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {items.length > 0 ? (
                        <table className="historial-table">
                          <thead>
                            <tr>
                              <th>Recibo</th>
                              <th>Fecha</th>
                              <th>Abonado</th>
                              <th>Origen</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((r) => (
                              <tr key={r._id}>
                                <td>#{r.numeroRecibo}</td>
                                <td>{fmtFecha(r.fecha)}</td>
                                <td>${fmtMoney(r.totalPagado)}</td>
                                <td>
                                  {r.vinculado ? (
                                    <span
                                      className="tag-vinculado"
                                      title="Este recibo se creó para otro número de trámite y fue adjuntado a este"
                                    >
                                      Vinculado
                                    </span>
                                  ) : (
                                    <span className="tag-directo">Directo</span>
                                  )}
                                </td>
                                <td>
                                  <a
                                    href={`${API}${r.pdfUrl}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Abrir PDF del recibo"
                                  >
                                    Ver PDF
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="historial-empty">
                          Todavía no hay recibos registrados para este trámite.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            <Field label="Total del Trámite *" error={errors.totalTramite}>
              <MoneyInput
                value={f.totalTramite}
                onChange={(v) => setF({ ...f, totalTramite: v })}
                readOnly={usaAbono && hasPrevPago} // ← BLOQUEA desde el 2º recibo
              />
            </Field>

            {/* Escritura / Protocolito: acumulado (readOnly) + Abono */}
            {usaAbono ? (
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

            {/* Campos “sistema” solo para Escritura (como tenías) 
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
            )}*/}
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
