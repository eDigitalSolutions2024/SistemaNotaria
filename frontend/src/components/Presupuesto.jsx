import React, { useEffect, useState, useMemo } from 'react';
import Select from 'react-select';
import axios from 'axios';
import '../css/Presupuesto.css';
import { useAuth } from '../auth/AuthContext'; 
// Ajusta esta URL si ya tienes un cliente axios centralizado
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8010/api',
  withCredentials: true,
});

const initialForm = {
  cliente: null,
  responsable: '',
  tipoCliente: 'Particular',

  avaluo: '',
  valorOperacion: '',
  montoCreditoHipotecario: '',

  compraVentaHipoteca: false,
  progVivienda: false,
  propiedadNueva: false,

  cargos: {
    isr: '',
    isrAdquisicion: '',
    trasladoDominio: '',
    trasladoDominio2: '',
    trasladoDominioRecargos: '',
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
    honorarios: '',
    iva: '',
    subtotal: '',
    retencionIsr: '',
    retencionIva: '',
    totalHonorarios: '',
  },

  observaciones: '',
};

const Presupuesto = () => {
  const { user } = useAuth();  // 👈 usuario actual
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

  // 🔹 Cargar clientes al iniciar
  useEffect(() => {
    
    const fetchClientes = async () => {
      try {
        setLoadingClientes(true);
        setError('');
        // Ajusta la URL si tu endpoint de clientes es distinto
        const res = await api.get('/clientes');
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

  const clienteOptions = useMemo(
    () =>
      clientes.map((c) => ({
        value: c._id, // ajusta si tu id es diferente
        label: `${c.idCliente || c.id || ''} - ${c.nombre || c.nombreCliente || ''}`,
      })),
    [clientes]
  );

  // 🔹 Handlers
  const handleBasicChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  const handleCargoChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      cargos: {
        ...prev.cargos,
        [name]: value,
      },
    }));
  };

  const handleHonorarioChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      honorariosCalc: {
        ...prev.honorariosCalc,
        [name]: value,
      },
    }));
  };

  const handleClienteChange = (option) => {
    setForm((prev) => ({
      ...prev,
      cliente: option,
    }));
    
  };

  // 🔹 Calcular total de cargos + total honorarios
  const totalCargos = useMemo(() => {
    return Object.values(form.cargos).reduce((sum, v) => {
      const n = parseFloat(String(v).replace(/,/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  }, [form.cargos]);

  const totalHonorariosNum = useMemo(() => {
    const n = parseFloat(String(form.honorariosCalc.totalHonorarios).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }, [form.honorariosCalc.totalHonorarios]);

  const totalPresupuesto = useMemo(
    () => totalCargos + totalHonorariosNum,
    [totalCargos, totalHonorariosNum]
  );

  // 🔹 Enviar al backend
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.cliente) {
      setError('Selecciona un cliente');
      return;
    }

    const body = {
      cliente: form.cliente.value,
      responsable: form.responsable || undefined,
      tipoCliente: form.tipoCliente || 'Particular',
      avaluo: parseFloat(form.avaluo) || 0,
      valorOperacion: parseFloat(form.valorOperacion) || 0,
      montoCreditoHipotecario: parseFloat(form.montoCreditoHipotecario) || 0,

      compraVentaHipoteca: form.compraVentaHipoteca,
      progVivienda: form.progVivienda,
      propiedadNueva: form.propiedadNueva,

      cargos: Object.fromEntries(
        Object.entries(form.cargos).map(([k, v]) => [k, parseFloat(v) || 0])
      ),

      honorariosCalc: Object.fromEntries(
        Object.entries(form.honorariosCalc).map(([k, v]) => [k, parseFloat(v) || 0])
      ),

      totalPresupuesto,
      observaciones: form.observaciones || undefined,
    };

    try {
      setSaving(true);
      const res = await api.post('/presupuestos', body);
      console.log('Presupuesto creado:', res.data);
      setSuccess('Presupuesto guardado correctamente');
      setForm(initialForm);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error al guardar presupuesto');
    } finally {
      setSaving(false);
    }
  };

return (
  <div className="pres-page">
    <div className="pres-header">
      <h1>Presupuesto</h1>
      <p>Calcula honorarios y cargos para el cliente seleccionado.</p>
    </div>

    {error && (
      <div className="pres-alert pres-alert-error">{error}</div>
    )}
    {success && (
      <div className="pres-alert pres-alert-success">{success}</div>
    )}

    <form className="pres-layout" onSubmit={handleSubmit}>
      {/* 🧑‍💼 Bloque: Datos del cliente + Datos de cálculo */}
      <section className="pres-card pres-card-wide">
        <h2 className="pres-card-title">Datos del cliente</h2>

        <div className="pres-row">
          <div className="pres-field pres-field-full">
            <label>Cliente</label>
            <Select
              options={clienteOptions}
              value={form.cliente}
              onChange={handleClienteChange}
              isLoading={loadingClientes}
              placeholder="Selecciona un cliente..."
              classNamePrefix="pres-select"
            />
          </div>
        </div>

        <div className="pres-row pres-row-2">
          <div className="pres-field">
            <label>Responsable / Abogado</label>
            <input
                readOnly
              type="text"
              name="responsable"
              value={form.responsable}
              onChange={handleBasicChange}
            />
          </div>
          <div className="pres-field">
            <label>Tipo de cliente</label>
            <input
              type="text"
              name="tipoCliente"
              value={form.tipoCliente}
              onChange={handleBasicChange}
            />
          </div>
        </div>

        <div className="pres-divider" />

        <h3 className="pres-subtitle">Datos de cálculo</h3>

        <div className="pres-row pres-row-3">
          <div className="pres-field">
            <label>Avalúo</label>
            <input
              type="number"
              step="0.01"
              name="avaluo"
              value={form.avaluo}
              onChange={handleBasicChange}
            />
          </div>
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
            <label>Monto crédito hipotecario</label>
            <input
              type="number"
              step="0.01"
              name="montoCreditoHipotecario"
              value={form.montoCreditoHipotecario}
              onChange={handleBasicChange}
            />
          </div>
        </div>

        <div className="pres-row pres-row-switches">
          <label className="pres-switch">
            <input
              type="checkbox"
              name="compraVentaHipoteca"
              checked={form.compraVentaHipoteca}
              onChange={handleCheckboxChange}
            />
            <span>Compra-venta hipotecaria</span>
          </label>
          <label className="pres-switch">
            <input
              type="checkbox"
              name="progVivienda"
              checked={form.progVivienda}
              onChange={handleCheckboxChange}
            />
            <span>Prog. Vivienda</span>
          </label>
          <label className="pres-switch">
            <input
              type="checkbox"
              name="propiedadNueva"
              checked={form.propiedadNueva}
              onChange={handleCheckboxChange}
            />
            <span>Propiedad nueva</span>
          </label>
        </div>
      </section>

      {/* 💸 Grid grande a 3 columnas (ocupa TODO el ancho) */}
      <section className="pres-grid-3">
        {/* HONORARIOS */}
        <div className="pres-card">
          <h2 className="pres-card-title">Honorarios</h2>
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
                type="number"
                step="0.01"
                name={name}
                value={form.honorariosCalc[name]}
                onChange={handleHonorarioChange}
              />
            </div>
          ))}

          <div className="pres-summary-line">
            <span>Total honorarios</span>
            <span className="pres-summary-amount">
              {totalHonorariosNum.toLocaleString('es-MX', {
                style: 'currency',
                currency: 'MXN',
              })}
            </span>
          </div>
        </div>

        {/* CARGOS 1 */}
        <div className="pres-card">
          <h2 className="pres-card-title">Cargos</h2>
          {[
            ['isr', 'I.S.R.'],
            ['isrAdquisicion', 'I.S.R. Adquisición'],
            ['trasladoDominio', 'Traslado de dominio'],
            ['trasladoDominio2', 'Traslado de dominio (2)'],
            ['trasladoDominioRecargos', 'Traslado dominio recargos'],
            ['registroPublico', 'Registro público'],
            ['registroPubVtaHip', 'Reg. pub. Vta/Hipot.'],
            ['registroPubPoderes', 'Reg. pub. poderes'],
            ['registroPubOtros', 'Reg. pub. otros'],
            ['registroPublicoRecargos', 'Reg. pub. recargos'],
          ].map(([name, label]) => (
            <div className="pres-field" key={name}>
              <label>{label}</label>
              <input
                type="number"
                step="0.01"
                name={name}
                value={form.cargos[name]}
                onChange={handleCargoChange}
              />
            </div>
          ))}
        </div>

        {/* CARGOS 2 */}
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
                type="number"
                step="0.01"
                name={name}
                value={form.cargos[name]}
                onChange={handleCargoChange}
              />
            </div>
          ))}

          <div className="pres-summary-line">
            <span>Total cargos</span>
            <span className="pres-summary-amount">
              {totalCargos.toLocaleString('es-MX', {
                style: 'currency',
                currency: 'MXN',
              })}
            </span>
          </div>
        </div>
      </section>

      {/* 🧾 Barra inferior con total grande */}
      <section className="pres-footer">
        <div className="pres-field pres-field-full">
          <label>Observaciones</label>
          <textarea
            rows="2"
            name="observaciones"
            value={form.observaciones}
            onChange={handleBasicChange}
          />
        </div>

        <div className="pres-footer-total">
          <span className="pres-footer-label">Total presupuesto</span>
          <span className="pres-footer-amount">
            {totalPresupuesto.toLocaleString('es-MX', {
              style: 'currency',
              currency: 'MXN',
            })}
          </span>
          <button
            type="submit"
            className="pres-btn-primary"
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar presupuesto'}
          </button>
        </div>
      </section>
    </form>
  </div>
);

};

export default Presupuesto;
