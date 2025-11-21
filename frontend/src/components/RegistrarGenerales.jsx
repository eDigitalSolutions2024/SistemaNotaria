// frontend/src/components/RegistrarGenerales.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import API_URL from "../api";
import Select from "react-select";
import "../css/RegistrarGenerales.css";

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: state.isFocused ? "#3b82f6" : "#e5e7eb",
    boxShadow: state.isFocused
      ? "0 0 0 3px rgba(59,130,246,0.1)"
      : "none",
    "&:hover": {
      borderColor: state.isFocused ? "#3b82f6" : "#e5e7eb",
    },
    fontSize: 15,
  }),

  valueContainer: (base) => ({
    ...base,
    padding: "0 12px",
  }),

  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0,
    border: 0,
    boxShadow: "none",
    backgroundColor: "transparent",
    fontSize: 15,
  }),

  placeholder: (base) => ({
    ...base,
    fontSize: 15,
  }),

  singleValue: (base) => ({
    ...base,
    fontSize: 15,
  }),

  menu: (base) => ({
    ...base,
    fontSize: 15,
    zIndex: 20,
  }),
};


export default function RegistrarGenerales() {
  const [clientes, setClientes] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [errorClientes, setErrorClientes] = useState("");
  const [clienteSeleccionado, setClienteSeleccionado] = useState("");

  // Array de personas (cada elemento es un objeto con todos los campos)
  const [personas, setPersonas] = useState([
    crearPersonaVacia()
  ]);

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const [searchCliente, setSearchCliente] = useState("");

  // 🔹 Función para crear un objeto "persona" vacío
  function crearPersonaVacia() {
    return {
      nombre_completo: "",
      lugar_nacimiento: "",
      fecha_nacimiento: "",
      ocupacion: "",
      estado_civil: "",
      domicilio: "",
      colonia: "",
      telefono_principal: "",
      telefono_secundario: "",
      correo_electronico: "",
      curp: "",
      rfc: "",
    };
  }

  // 🔹 Cargar clientes al montar el componente
  useEffect(() => {
    const fetchClientes = async () => {
      try {
        setLoadingClientes(true);
        const res = await axios.get(`${API_URL}/clientes`);
        console.log(res.data);
        // Filtrar solo Asignado / Finalizado
        const filtrados = res.data.filter(
          (c) => c.estado === "Asignado" || c.estado === "Finalizado"
        );
        setClientes(filtrados);
        setErrorClientes("");
      } catch (error) {
        console.error("Error al obtener clientes:", error);
        setErrorClientes("Error al cargar clientes");
      } finally {
        setLoadingClientes(false);
      }
    };

    fetchClientes();
  }, []);

  // 🔹 Manejar cambio en el select de cliente
  const handleChangeCliente = (e) => {
    setClienteSeleccionado(e.target.value);
  };

  // 🔹 Manejar cambios en los campos de una persona
  const handleChangePersona = (index, field, value) => {
    const nuevas = [...personas];
    nuevas[index] = {
      ...nuevas[index],
      [field]: value,
    };
    setPersonas(nuevas);
  };

  // 🔹 Añadir otra persona (botón +)
  const handleAddPersona = () => {
    setPersonas((prev) => [...prev, crearPersonaVacia()]);
  };

  // 🔹 Eliminar una persona (opcional, no permitimos borrar si solo hay una)
  const handleRemovePersona = (index) => {
    if (personas.length === 1) return;
    const nuevas = personas.filter((_, i) => i !== index);
    setPersonas(nuevas);
  };

  // 🔹 Validar antes de enviar
  const validarFormulario = () => {
    if (!clienteSeleccionado) {
      setMensaje("Debes seleccionar un cliente.");
      return false;
    }

    for (let i = 0; i < personas.length; i++) {
      const p = personas[i];
      // Validar campos obligatorios
      const camposObligatorios = [
        "nombre_completo",
        "lugar_nacimiento",
        "fecha_nacimiento",
        "ocupacion",
        "estado_civil",
        "domicilio",
        "colonia",
        "telefono_principal", // obligatorio
        "correo_electronico",
        "curp",
        "rfc",
      ];

      for (const campo of camposObligatorios) {
        if (!p[campo] || String(p[campo]).trim() === "") {
          setMensaje(
            `Falta llenar el campo "${campo.replace("_", " ")}" en la persona ${i + 1}.`
          );
          return false;
        }
      }

      // Validación básica de correo
      if (p.correo_electronico && !/\S+@\S+\.\S+/.test(p.correo_electronico)) {
        setMensaje(`El correo electrónico en la persona ${i + 1} no es válido.`);
        return false;
      }
    }

    setMensaje("");
    return true;
  };

  // 🔹 Enviar datos al backend
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validarFormulario()) return;

    try {
      setGuardando(true);
      setMensaje("");

      const clienteIdNum = Number(clienteSeleccionado);

      if (!clienteIdNum || Number.isNaN(clienteIdNum)) {
        setMensaje("Selecciona un cliente válido.");
        return;
      }

      const payload = {
        clienteId: clienteIdNum,
        personas,
      };


      await axios.post(`${API_URL}/clientes-generales`, payload);
      console.log("clienteSeleccionado:", clienteSeleccionado, "tipo:", typeof clienteSeleccionado);
      console.log("payload a enviar:", payload);
      await axios.post(`${API_URL}/clientes-generales`, payload);


      setMensaje("Datos generales guardados correctamente.");
      // Opcional: limpiar formulario
      setPersonas([crearPersonaVacia()]);
    } catch (error) {
      console.error("Error al guardar datos generales:", error);
      setMensaje(
        error?.response?.data?.message ||
          "Error al guardar datos generales. Revisa la consola."
      );
    } finally {
      setGuardando(false);
    }
  };

  // 🔹 Filtrar clientes por nombre o teléfono
  const clientesFiltrados = clientes.filter((c) => {
    if (!searchCliente.trim()) return true; // si no hay texto, mostramos todos

    const term = searchCliente.toLowerCase();
    const nombre = (c.nombre || "").toLowerCase();
    const telefono = (c.numero_telefono || "").toLowerCase();

    return nombre.includes(term) || telefono.includes(term);
  });

  const clientesOrdenados = [...clientesFiltrados].sort((a, b) => {
    const idA = Number(a.id || a._id || 0);
    const idB = Number(b.id || b._id || 0);
    return idB - idA;
  });

  const clienteOptions = clientesOrdenados.map((c) => {
    const idCliente = c._id ?? c.id;
    const motivo = c.motivo && c.motivo.trim() !== '' ? c.motivo : 'Sin motivo';
    const telefono = c.numero_telefono || '';
    return {
      value: idCliente,
      label: `${c.nombre} - ${motivo} (${idCliente})`,
    };
  });

  return (
    <div className="registrar-generales-container">
      <h2>Registrar Datos Generales del Cliente</h2>

      {loadingClientes && <p>Cargando clientes...</p>}
      {errorClientes && <p style={{ color: "red" }}>{errorClientes}</p>}

      <form onSubmit={handleSubmit}>
        {/* Select de cliente */}
        <div className="form-group">
          <label>Cliente</label>
          <Select
            className="react-select-container"
            classNamePrefix="react-select"
            styles={selectStyles}
            options={clienteOptions}
            isSearchable
            placeholder="Selecciona un cliente..."
            noOptionsMessage={() => "No se encontraron clientes"}
            value={
              clienteOptions.find((opt) => opt.value === Number(clienteSeleccionado)) ||
              null
            }
            onChange={(option) => {
              // option puede ser null si limpias el select
              setClienteSeleccionado(option ? option.value : "");
            }}
          />
          <small className="help-text">
            Puedes escribir el nombre o teléfono para filtrar.
          </small>
        </div>
        <hr />

        {/* Bloques de personas */}
        {personas.map((p, index) => (
          <div key={index} className="persona-block">
            <h3>Persona {index + 1}</h3>

            {/* Fila 1: Nombre, Lugar nacimiento, Fecha nacimiento */}
            <div className="form-row">
              <div className="form-group">
                <label>Nombre completo *</label>
                <input
                  type="text"
                  value={p.nombre_completo}
                  onChange={(e) =>
                    handleChangePersona(index, "nombre_completo", e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Lugar de nacimiento *</label>
                <input
                  type="text"
                  value={p.lugar_nacimiento}
                  onChange={(e) =>
                    handleChangePersona(index, "lugar_nacimiento", e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Fecha de nacimiento *</label>
                <input
                  type="date"
                  value={p.fecha_nacimiento}
                  onChange={(e) =>
                    handleChangePersona(index, "fecha_nacimiento", e.target.value)
                  }
                  required
                />
              </div>
            </div>

            {/* Fila 2: Ocupación, Estado civil, Domicilio */}
            <div className="form-row">
              <div className="form-group">
                <label>Ocupación *</label>
                <input
                  type="text"
                  value={p.ocupacion}
                  onChange={(e) =>
                    handleChangePersona(index, "ocupacion", e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Estado civil *</label>
                <input
                  type="text"
                  value={p.estado_civil}
                  onChange={(e) =>
                    handleChangePersona(index, "estado_civil", e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Domicilio *</label>
                <input
                  type="text"
                  value={p.domicilio}
                  onChange={(e) =>
                    handleChangePersona(index, "domicilio", e.target.value)
                  }
                  required
                />
              </div>
            </div>

            {/* Fila 3: Colonia, Teléfono principal, Teléfono secundario */}
            <div className="form-row">
              <div className="form-group">
                <label>Colonia *</label>
                <input
                  type="text"
                  value={p.colonia}
                  onChange={(e) =>
                    handleChangePersona(index, "colonia", e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Teléfono principal *</label>
                <input
                  type="text"
                  value={p.telefono_principal}
                  onChange={(e) =>
                    handleChangePersona(index, "telefono_principal", e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Teléfono secundario (opcional)</label>
                <input
                  type="text"
                  value={p.telefono_secundario}
                  onChange={(e) =>
                    handleChangePersona(index, "telefono_secundario", e.target.value)
                  }
                />
              </div>
            </div>

            {/* Fila 4: Correo, CURP, RFC */}
            <div className="form-row">
              <div className="form-group">
                <label>Correo electrónico *</label>
                <input
                  type="email"
                  value={p.correo_electronico}
                  onChange={(e) =>
                    handleChangePersona(index, "correo_electronico", e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>CURP *</label>
                <input
                  type="text"
                  value={p.curp}
                  onChange={(e) =>
                    handleChangePersona(index, "curp", e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>RFC *</label>
                <input
                  type="text"
                  value={p.rfc}
                  onChange={(e) =>
                    handleChangePersona(index, "rfc", e.target.value)
                  }
                  required
                />
              </div>
            </div>

            {personas.length > 1 && (
              <button
                type="button"
                className="btn-remove-persona"
                onClick={() => handleRemovePersona(index)}
              >
                Eliminar persona
              </button>
            )}
          </div>
        ))}

        {/* Botón para añadir más personas */}
        <button
          type="button"
          className="btn-add-persona"
          onClick={handleAddPersona}
        >
          + Añadir persona
        </button>

        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={guardando || loadingClientes}>
            {guardando ? "Guardando..." : "Guardar datos generales"}
          </button>
        </div>

        {mensaje && (
          <p style={{ marginTop: 10, color: mensaje.includes("Error") ? "red" : "green" }}>
            {mensaje}
          </p>
        )}
      </form>
    </div>
  );
}
