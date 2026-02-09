import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import axios from 'axios';
import '../css/Presupuesto.css';
import { useAuth } from '../auth/AuthContext';
import ConsultarPresupuestosModal from "../components/ConsultarPresupuestosModal";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8010/api',
  withCredentials: true,
});

const REGISTRO_PUBLICO_TABLAS = {
  2025: [
    { min: 0, max: 100000, fee: 3015 },
    { min: 100000, max: 200000, fee: 4220 },
    { min: 200000, max: 400000, fee: 8234 },
    { min: 400000, max: 700000, fee: 14256 },
    { min: 700000, max: Infinity, fee: 20278 },
  ],
};

const getRegistroPublicoFee = (year, valorOperacion) => {
  const tabla = REGISTRO_PUBLICO_TABLAS[year];
  if (!tabla) return 0;
  const tramo = tabla.find((t) => valorOperacion >= t.min && valorOperacion < t.max);
  return tramo ? tramo.fee : 0;
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const parseNum = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const initialForm = {
  clienteId: '',

  responsable: '',
  tipoTramite: { value: 'Compraventa', label: 'Compraventa' },

  avaluo: '',
  valorOperacion: '',
  valorTerreno: '',
  valorConstruccion: '',
  anioRegistro: { value: 2025, label: '2025' },

  cargos: {
    isr: '',
    isrAdquisicion: '',
    traslacionDominio: '',
    traslacionDominio2: '',
    traslacionDominioRecargos: '',
    registroPublico: '',
    registroPubVtaHip: '',
    registroPubPoderes: '',
    registroPubOtros: '',
    registroPublicoRecargos: '',
    solicPermiso: '',
    avisoPermiso: '',
    ivaLocalComerc: '',
    actosJuridicos: '',
    costoAvaluo: '',
    gastosGestiones: '',
    impuestoCedular: '',
    impuestoPredial: '',
    tramiteForaneo: '',
    otrosConceptos: '',
    certificados1: '',
    certificados2: '',
    certificados3: '',
  },

  honorariosCalc: {
    porcentaje: { value: 10, label: '10%' },
    honorarios: '',
    iva: '',
    subtotal: '',
    retencionIsr: '',
    retencionIva: '',
    totalHonorarios: '',
  },

  observaciones: '',
};

export default function Presupuesto() {
  const { user } = useAuth();

  const getUserName = (u) =>
    (u?.nombre || u?.name || u?.fullName || u?.username || '').trim();

  const [form, setForm] = useState(() => ({
    ...initialForm,
    responsable: getUserName(user) || '',
  }));

  const [clientes, setClientes] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openConsulta, setOpenConsulta] = useState(false);

  useEffect(() => {
    console.log('[DEBUG form.clienteId]', form.clienteId);
  }, [form.clienteId]);

  const tramiteOptions = useMemo(
    () => [
      { value: 'Compraventa', label: 'Compraventa' },
      { value: 'Donacion', label: 'Donación' },
      { value: 'Adjudicacion', label: 'Adjudicación' },
      { value: 'Protocolizacion', label: 'Protocolización' },
    ],
    []
  );

  const anioRegistroOptions = useMemo(() => {
    return Object.keys(REGISTRO_PUBLICO_TABLAS)
      .map((y) => Number(y))
      .sort((a, b) => b - a)
      .map((y) => ({ value: y, label: String(y) }));
  }, []);

  const porcentajeHonorariosOptions = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const v = i + 1;
        return { value: v, label: `${v}%` };
      }),
    []
  );

  // Cliente seleccionado completo (para obtener idCliente number)
  const selectedCliente = useMemo(() => {
    const id = form.clienteId;
    if (!id) return null;
    return (clientes || []).find(c => (c._id || c.id) === id) || null;
  }, [clientes, form.clienteId]);

  // idCliente numérico (2001, 2002...) para filtrar en el modal si tu backend lo soporta
  const clienteIdNumber = useMemo(() => {
    const n = Number(selectedCliente?.idCliente || selectedCliente?.idClienteNumero || '');
    return Number.isFinite(n) ? n : null;
  }, [selectedCliente]);

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        setLoadingClientes(true);
        setError('');
        const res = await api.get('/clientes/by-servicio', {
          params: { servicio: 'Presupuesto' }
        });
        setClientes(res.data || []);
      } catch (err) {
        console.error(err);
        setError('Error al cargar clientes');
      } finally {
        setLoadingClientes(false);
      }
    };
    fetchClientes();
  }, []);

  const clienteOptions = useMemo(() => {
    const list = [...(clientes || [])].reverse();

    const opts = list.map((c) => ({
      value: c._id || c.id || c._doc?._id,
      label: `${c.idCliente || c.idClienteNumero || c.id || ''} - ${c.nombre || c.nombreCliente || ''}`,
    }));

    if (opts.length) {
      console.log('[DEBUG clienteOptions[0]]', opts[0]);
      console.log('[DEBUG cliente raw[0]]', clientes[0]);
    }

    return opts;
  }, [clientes]);

  const selectedClienteOption = useMemo(() => {
    return clienteOptions.find((o) => o.value === form.clienteId) || null;
  }, [clienteOptions, form.clienteId]);

  const handleBasicChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCargoChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      cargos: { ...prev.cargos, [name]: value },
    }));
  };

  const handleHonorarioChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      honorariosCalc: { ...prev.honorariosCalc, [name]: value },
    }));
  };

  const handleClienteChange = (option) => {
    console.log('[DEBUG handleClienteChange option]', option);
    setForm((prev) => ({
      ...prev,
      clienteId: option?.value || '',
    }));
  };

  // avalúo = valorOperacion
  useEffect(() => {
    setForm((prev) => ({ ...prev, avaluo: prev.valorOperacion }));
  }, [form.valorOperacion]);

  const datosCalculo = useMemo(() => {
    const valorOperacion = parseNum(form.valorOperacion);
    const valorTerreno = parseNum(form.valorTerreno);
    const valorConstruccion = parseNum(form.valorConstruccion);

    const terrenoCapturado = String(form.valorTerreno).trim() !== '';
    const construccionCapturado = String(form.valorConstruccion).trim() !== '';
    const operacionCapturada = String(form.valorOperacion).trim() !== '';

    const toCents = (n) => Math.round((Number(n) + Number.EPSILON) * 100);
    const suma = valorTerreno + valorConstruccion;

    const coincide =
      operacionCapturada &&
      terrenoCapturado &&
      construccionCapturado &&
      toCents(valorTerreno) + toCents(valorConstruccion) === toCents(valorOperacion);

    return {
      valorOperacion,
      suma,
      coincide,
      puedeContinuar: operacionCapturada && terrenoCapturado && construccionCapturado && coincide,
    };
  }, [form.valorOperacion, form.valorTerreno, form.valorConstruccion]);

  // Traslación dominio (auto)
  useEffect(() => {
    if (!datosCalculo.puedeContinuar) return;

    const valorOperacion = parseNum(form.valorOperacion);
    const tramite = form.tipoTramite?.value || 'Compraventa';
    const rateBase = tramite === 'Compraventa' ? 0.02 : 0.01;

    const base = valorOperacion * rateBase;
    const valorUniversitario = base * 0.04;
    const total = base + valorUniversitario;

    setForm((prev) => ({
      ...prev,
      cargos: { ...prev.cargos, traslacionDominio: round2(total) },
    }));
  }, [datosCalculo.puedeContinuar, form.valorOperacion, form.tipoTramite]);

  // Registro público (auto)
  useEffect(() => {
    if (!datosCalculo.puedeContinuar) return;

    const valorOperacion = parseNum(form.valorOperacion);
    const year = form.anioRegistro?.value || 2025;
    const fee = getRegistroPublicoFee(year, valorOperacion);

    setForm((prev) => ({
      ...prev,
      cargos: { ...prev.cargos, registroPublico: fee },
    }));
  }, [datosCalculo.puedeContinuar, form.valorOperacion, form.anioRegistro]);

  // Honorarios (auto)
  useEffect(() => {
    if (!datosCalculo.puedeContinuar) return;

    const valorOperacion = parseNum(form.valorOperacion);
    const pct = form.honorariosCalc.porcentaje?.value || 0;

    const subtotal = valorOperacion * (pct / 100);
    const iva = subtotal * 0.16;
    const totalHonorarios = subtotal + iva;

    setForm((prev) => ({
      ...prev,
      honorariosCalc: {
        ...prev.honorariosCalc,
        subtotal: round2(subtotal),
        iva: round2(iva),
        totalHonorarios: round2(totalHonorarios),
        honorarios: round2(subtotal),
      },
    }));
  }, [datosCalculo.puedeContinuar, form.valorOperacion, form.honorariosCalc.porcentaje]);

  const bloquearAbajo = !datosCalculo.puedeContinuar;

  const totalCargos = useMemo(() => {
    return Object.values(form.cargos).reduce((sum, v) => sum + parseNum(v), 0);
  }, [form.cargos]);

  const totalHonorariosNum = useMemo(() => parseNum(form.honorariosCalc.totalHonorarios), [
    form.honorariosCalc.totalHonorarios,
  ]);

  const totalPresupuesto = useMemo(() => totalCargos + totalHonorariosNum, [
    totalCargos,
    totalHonorariosNum,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    console.log('CLIENTE AL ENVIAR (clienteId):', form.clienteId);

    if (!form.clienteId) {
      setError('Selecciona un cliente válido');
      return;
    }

    if (!datosCalculo.puedeContinuar) {
      setError('Primero captura Valor de operación, Valor Terreno y Valor Construcción y verifica que la suma coincida.');
      return;
    }

    const body = {
      // ⚠️ así lo tienes hoy: manda _id string
      cliente: form.clienteId,

      responsable: form.responsable || undefined,
      tipoTramite: form.tipoTramite?.value || 'Compraventa',

      avaluo: parseNum(form.valorOperacion),
      valorOperacion: parseNum(form.valorOperacion),
      valorTerreno: parseNum(form.valorTerreno),
      valorConstruccion: parseNum(form.valorConstruccion),

      anioRegistro: form.anioRegistro?.value || 2025,

      cargos: Object.fromEntries(Object.entries(form.cargos).map(([k, v]) => [k, parseNum(v)])),

      honorariosCalc: {
        ...Object.fromEntries(Object.entries(form.honorariosCalc).map(([k, v]) => [k, parseNum(v)])),
        porcentaje: form.honorariosCalc.porcentaje?.value || 0,
      },

      porcentajeHonorarios: form.honorariosCalc.porcentaje?.value || 0,
      totalPresupuesto,
      observaciones: form.observaciones || undefined,
    };

    try {
      setSaving(true);
      const res = await api.post('/presupuestos', body);

      setSuccess('Presupuesto guardado correctamente');

      const id = res.data?._id;
      if (id) {
        const base = api.defaults.baseURL.replace(/\/$/, '');
        window.open(`${base}/presupuestos/${id}/pdf`, '_blank');
      }

      setForm((prev) => ({
        ...initialForm,
        clienteId: prev.clienteId,
        responsable: getUserName(user) || '',
      }));
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error al guardar presupuesto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pres-page">

      {/* ✅ Header con botón arriba */}
      <div className="pres-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1>Presupuesto</h1>
          <p>Calcula honorarios y cargos para el cliente seleccionado.</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="pres-btn"
            onClick={() => setOpenConsulta(true)}
          >
            Consultar presupuestos
          </button>
        </div>
      </div>

      {error && <div className="pres-alert pres-alert-error">{error}</div>}
      {success && <div className="pres-alert pres-alert-success">{success}</div>}

      <form className="pres-layout" onSubmit={handleSubmit}>
        <section className="pres-card pres-card-wide">
          <h2 className="pres-card-title">Datos del cliente</h2>

          <div className="pres-row">
            <div className="pres-field pres-field-full">
              <label>Cliente</label>
              <Select
                options={clienteOptions}
                value={selectedClienteOption}
                onChange={handleClienteChange}
                isLoading={loadingClientes}
                placeholder="Selecciona un cliente..."
                classNamePrefix="pres-select"
                isClearable
              />
            </div>
          </div>

          <div className="pres-row pres-row-2">
            <div className="pres-field">
              <label>Responsable / Abogado</label>
              <input readOnly type="text" name="responsable" value={form.responsable} />
            </div>

            <div className="pres-field">
              <label>Tipo de trámite</label>
              <Select
                options={tramiteOptions}
                value={form.tipoTramite}
                onChange={(o) => setForm((p) => ({ ...p, tipoTramite: o }))}
                classNamePrefix="pres-select"
              />
            </div>

            <div className="pres-field">
              <label>Año Derechos Registro</label>
              <Select
                options={anioRegistroOptions}
                value={form.anioRegistro}
                onChange={(o) => setForm((p) => ({ ...p, anioRegistro: o }))}
                classNamePrefix="pres-select"
              />
            </div>
          </div>

          <div className="pres-divider" />

          <h3 className="pres-subtitle">Datos de cálculo</h3>

          <div className="pres-row pres-row-3">
            <div className="pres-field">
              <label>Valor de operación</label>
              <input
                type="number"
                step="0.01"
                name="valorOperacion"
                value={form.valorOperacion}
                onChange={handleBasicChange}
              />
            </div>

            <div className="pres-field">
              <label>Valor Terreno</label>
              <input
                type="number"
                step="0.01"
                name="valorTerreno"
                value={form.valorTerreno}
                onChange={handleBasicChange}
              />
            </div>

            <div className="pres-field">
              <label>Valor Construcción</label>
              <input
                type="number"
                step="0.01"
                name="valorConstruccion"
                value={form.valorConstruccion}
                onChange={handleBasicChange}
              />

              {String(form.valorOperacion).trim() !== '' &&
                (String(form.valorTerreno).trim() !== '' || String(form.valorConstruccion).trim() !== '') && (
                  <small
                    style={{
                      display: 'block',
                      marginTop: 6,
                      fontWeight: 600,
                      color: datosCalculo.coincide ? '#167d3d' : '#b42318',
                    }}
                  >
                    {datosCalculo.coincide
                      ? '✔ Terreno + Construcción coincide con Valor de operación'
                      : `✖ La suma (${datosCalculo.suma.toLocaleString('es-MX')}) debe ser igual al Valor de operación`}
                  </small>
                )}
            </div>
          </div>
        </section>

        <section className="pres-grid-3">
          <div className="pres-card">
            <h2 className="pres-card-title">Honorarios</h2>

            <div className="pres-field">
              <label>Porcentaje honorarios</label>
              <Select
                options={porcentajeHonorariosOptions}
                value={form.honorariosCalc.porcentaje}
                onChange={(o) =>
                  setForm((prev) => ({
                    ...prev,
                    honorariosCalc: { ...prev.honorariosCalc, porcentaje: o },
                  }))
                }
                classNamePrefix="pres-select"
              />
            </div>

            {[
              ['honorarios', 'Honorarios'],
              ['iva', 'I.V.A.'],
              ['subtotal', 'Subtotal'],
              ['retencionIsr', 'Retención I.S.R.'],
              ['retencionIva', 'Retención I.V.A.'],
              ['totalHonorarios', 'Total honorarios'],
            ].map(([name, label]) => (
              <div className="pres-field" key={name}>
                <label>{label}</label>
                <input
                  disabled={bloquearAbajo}
                  type="number"
                  step="0.01"
                  name={name}
                  value={form.honorariosCalc[name]}
                  onChange={handleHonorarioChange}
                />
              </div>
            ))}
          </div>

          <div className="pres-card">
            <h2 className="pres-card-title">Cargos</h2>
            {[
              ['isr', 'I.S.R.'],
              ['isrAdquisicion', 'I.S.R. Adquisición'],
              ['traslacionDominio', 'Traslación de Dominio'],
              ['traslacionDominio2', 'Traslación de dominio (2)'],
              ['traslacionDominioRecargos', 'Traslación dominio recargos'],
              ['registroPublico', 'Registro público'],
              ['registroPubVtaHip', 'Reg. pub. Vta/Hipot.'],
              ['registroPubPoderes', 'Reg. pub. poderes'],
              ['registroPubOtros', 'Reg. pub. otros'],
              ['registroPublicoRecargos', 'Reg. pub. recargos'],
            ].map(([name, label]) => {
              const isAuto = name === 'traslacionDominio' || name === 'registroPublico';
              return (
                <div className="pres-field" key={name}>
                  <label>{label}</label>
                  <input
                    disabled={bloquearAbajo}
                    readOnly={isAuto}
                    type="number"
                    step="0.01"
                    name={name}
                    value={form.cargos[name]}
                    onChange={handleCargoChange}
                  />
                </div>
              );
            })}
          </div>

          <div className="pres-card">
            <h2 className="pres-card-title">Otros cargos</h2>
            {[
              ['solicPermiso', 'Solicitud permiso'],
              ['avisoPermiso', 'Aviso permiso'],
              ['ivaLocalComerc', 'IVA local comerc.'],
              ['actosJuridicos', 'Actos jurídicos'],
              ['costoAvaluo', 'Costo avalúo'],
              ['gastosGestiones', 'Gastos y gestiones'],
              ['impuestoCedular', 'Impuesto cedular'],
              ['impuestoPredial', 'Impuesto predial'],
              ['tramiteForaneo', 'Trámite foráneo'],
              ['otrosConceptos', 'Otros conceptos'],
              ['certificados1', 'Certificados (1)'],
              ['certificados2', 'Certificados (2)'],
              ['certificados3', 'Certificados (3)'],
            ].map(([name, label]) => (
              <div className="pres-field" key={name}>
                <label>{label}</label>
                <input
                  disabled={bloquearAbajo}
                  type="number"
                  step="0.01"
                  name={name}
                  value={form.cargos[name]}
                  onChange={handleCargoChange}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="pres-footer">
          <div className="pres-field pres-field-full">
            <label>Observaciones</label>
            <textarea
              disabled={bloquearAbajo}
              rows="2"
              name="observaciones"
              value={form.observaciones}
              onChange={handleBasicChange}
            />
          </div>

          <div className="pres-footer-total">
            <span className="pres-footer-label">Total presupuesto</span>
            <span className="pres-footer-amount">
              {totalPresupuesto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
            </span>

            <button type="submit" className="pres-btn-primary" disabled={saving || bloquearAbajo}>
              {saving ? 'Guardando…' : 'Guardar presupuesto'}
            </button>
          </div>
        </section>
      </form>

      {/* ✅ Modal fuera del form (mejor UX) */}
      <ConsultarPresupuestosModal
        open={openConsulta}
        onClose={() => setOpenConsulta(false)}
        api={api}
        clienteIdNumber={clienteIdNumber}
        onPick={(p) => {
          setForm((prev) => ({
            ...prev,
            tipoTramite: { value: p.tipoTramite, label: p.tipoTramite },
            valorOperacion: p.valorOperacion ?? "",
            valorTerreno: p.valorTerreno ?? "",
            valorConstruccion: p.valorConstruccion ?? "",
            anioRegistro: { value: p.anioRegistro, label: String(p.anioRegistro) },
            cargos: { ...prev.cargos, ...(p.cargos || {}) },
            honorariosCalc: {
              ...prev.honorariosCalc,
              ...(p.honorariosCalc || {}),
              porcentaje: {
                value: p.porcentajeHonorarios ?? prev.honorariosCalc.porcentaje?.value ?? 10,
                label: `${p.porcentajeHonorarios ?? prev.honorariosCalc.porcentaje?.value ?? 10}%`,
              },
            },
            observaciones: p.observaciones ?? "",
          }));
          setOpenConsulta(false);
        }}
      />
    </div>
  );
}
