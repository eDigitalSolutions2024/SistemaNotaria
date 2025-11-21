// frontend/src/components/ConsultarGenerales.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import Select from "react-select";
import API_URL from "../api";
import "../css/ConsultarGenerales.css";

const ConsultarGenerales = () => {
  const [clientes, setClientes] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [errorClientes, setErrorClientes] = useState("");

  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [datosCliente, setDatosCliente] = useState(null);

  const [generales, setGenerales] = useState([]);
  const [loadingGenerales, setLoadingGenerales] = useState(false);
  const [errorGenerales, setErrorGenerales] = useState("");

  const [descargandoPDF, setDescargandoPDF] = useState(false);
  const [errorPDF, setErrorPDF] = useState("");

  // Cargar clientes al montar
  useEffect(() => {
    const fetchClientes = async () => {
      try {
        setLoadingClientes(true);
        const res = await axios.get(`${API_URL}/clientes`);
        // res.data ya viene con: id, nombre, numero_telefono, estado, servicio, tieneCita...
        // Filtramos solo Asignado / Finalizado (igual que en RegistrarGenerales)
        const filtrados = res.data.filter(
          (c) => c.estado === "Asignado" || c.estado === "Finalizado"
        );
        setClientes(filtrados);
        setErrorClientes("");
      } catch (error) {
        console.error("Error al obtener clientes:", error);
        setErrorClientes("Error al cargar la lista de clientes.");
      } finally {
        setLoadingClientes(false);
      }
    };

    fetchClientes();
  }, []);

  // Cargar datos generales cuando se elige un cliente
  const fetchGenerales = async (clienteId) => {
    if (!clienteId) return;
    try {
      setLoadingGenerales(true);
      setErrorGenerales("");
      setGenerales([]);

      const res = await axios.get(
        `${API_URL}/clientes-generales/por-cliente/${clienteId}`
      );
      setGenerales(res.data || []);
    } catch (error) {
      console.error("Error al obtener datos generales:", error);
      setErrorGenerales(
        error?.response?.data?.message ||
          "Error al obtener los datos generales del cliente."
      );
    } finally {
      setLoadingGenerales(false);
    }
  };

  const clientesOrdenados = [...clientes].sort((a, b) => {
    const idA = Number(a.id || a._id || 0);
    const idB = Number(b.id || b._id || 0);
    return idB - idA;
  });

  // Options para react-select
  const clienteOptions = clientesOrdenados.map((c) => {
    const idCliente = c._id ?? c.id;
    const motivo = c.motivo && c.motivo.trim() !== '' ? c.motivo : 'Sin motivo';
    const telefono = c.numero_telefono || '';

    return {
      value: idCliente,
      label: `${c.nombre} - ${motivo} (${idCliente})`,
    };
  });


  // Manejar cambio en el select
  const handleChangeCliente = (option) => {
    if (!option) {
      setClienteSeleccionado(null);
      setDatosCliente(null);
      setGenerales([]);
      return;
    }

    const id = option.value;
    setClienteSeleccionado(id);

    // Buscar datos del cliente en el arreglo original
    const cli = clientes.find((c) => c.id === id) || null;
    setDatosCliente(cli);

    // Traer datos generales del backend
    fetchGenerales(id);
  };

    const handleDescargarPDF = async () => {
    if (!clienteSeleccionado) return;
    if (!generales || generales.length === 0) return;

    try {
      setDescargandoPDF(true);
      setErrorPDF("");

      const url = `${API_URL}/clientes-generales/pdf/${clienteSeleccionado}`;

      // Usamos axios para traer el PDF como blob
      const res = await axios.get(url, {
        responseType: "blob",
      });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute(
        "download",
        `datos-generales-${clienteSeleccionado}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Error al descargar PDF:", error);
      setErrorPDF(
        error?.response?.data?.message ||
          "Ocurrió un error al generar o descargar el PDF."
      );
    } finally {
      setDescargandoPDF(false);
    }
  };


  return (
    <div className="consultar-generales-container">
      <h2>Consultar datos generales del cliente</h2>

      {loadingClientes && <p>Cargando clientes...</p>}
      {errorClientes && <p className="mensaje-error">{errorClientes}</p>}

      {/* BLOQUE 1: Select de cliente */}
      <div className="cg-card">
        <div className="form-group">
          <label>Cliente</label>
          <Select
            options={clienteOptions}
            isSearchable
            placeholder="Selecciona un cliente..."
            noOptionsMessage={() => "No se encontraron clientes"}
            value={
              clienteSeleccionado
                ? clienteOptions.find((opt) => opt.value === clienteSeleccionado)
                : null
            }
            onChange={handleChangeCliente}
          />
          <small className="help-text">
            Escribe el nombre o teléfono para filtrar.
          </small>
        </div>
      </div>

      {/* BLOQUE 2: Resumen del cliente */}
      {datosCliente && (
        <div className="cg-card cg-resumen">
          <h3>Datos del cliente</h3>
          <div className="cg-resumen-grid">
            <div>
              <span className="cg-label">ID:</span>
              <span>{datosCliente.id}</span>
            </div>
            <div>
              <span className="cg-label">Nombre:</span>
              <span>{datosCliente.nombre}</span>
            </div>
            <div>
              <span className="cg-label">Teléfono:</span>
              <span>{datosCliente.numero_telefono}</span>
            </div>
            <div>
              <span className="cg-label">Estado:</span>
              <span>{datosCliente.estado}</span>
            </div>
            <div>
              <span className="cg-label">Servicio:</span>
              <span>{datosCliente.servicio || "—"}</span>
            </div>
            <div>
              <span className="cg-label">Tiene cita:</span>
              <span>{datosCliente.tieneCita ? "Sí" : "No"}</span>
            </div>
          </div>
        </div>
      )}

      {/* BLOQUE 3: Tabla de personas / datos generales */}
      {clienteSeleccionado && (
        <div className="cg-card">
          <div className="cg-card-header">
            <h3>Personas registradas</h3>
            <button
                type="button"
                className="cg-btn-pdf"
                disabled={
                descargandoPDF ||
                !generales ||
                generales.length === 0 ||
                !clienteSeleccionado
                }
                onClick={handleDescargarPDF}
                title={
                !generales || generales.length === 0
                    ? "Primero registra datos generales para este cliente."
                    : "Descargar PDF de datos generales"
                }
            >
                {descargandoPDF ? "Generando PDF..." : "Descargar PDF"}
            </button>
            </div>

          {loadingGenerales && <p>Cargando datos generales...</p>}
          {errorGenerales && (
            <p className="mensaje-error">{errorGenerales}</p>
            )}
          {errorPDF && (
            <p className="mensaje-error">{errorPDF}</p>
            )}


          {!loadingGenerales && !errorGenerales && generales.length === 0 && (
            <p>No hay datos generales registrados para este cliente.</p>
          )}

          {!loadingGenerales && generales.length > 0 && (
            <div className="cg-table-wrapper">
              <table className="cg-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nombre completo</th>
                    <th>CURP</th>
                    <th>RFC</th>
                    <th>Teléfono principal</th>
                    <th>Correo electrónico</th>
                  </tr>
                </thead>
                <tbody>
                  {generales.map((p, idx) => (
                    <tr key={p._id || idx}>
                      <td>{idx + 1}</td>
                      <td>{p.nombre_completo}</td>
                      <td>{p.curp}</td>
                      <td>{p.rfc}</td>
                      <td>{p.telefono_principal}</td>
                      <td>{p.correo_electronico}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConsultarGenerales;
