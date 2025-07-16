import React from 'react';
import FormCliente from '../components/FormCliente';
import TablaAbogados from '../components/AbogadosTable';
import TablaClientes from '../components/TablaClientes'; // <-- Agregado
import TablaSalas from '../components/TablaSala'; // <-- Agregado
import '../css/Home.css'; // Asegúrate de que la ruta sea correcta
const Home = () => {
  return (
    
    <div className="contenedor-formulario-y-abogados">
  {/* Tabla de abogados */}
  <div className="tabla-abogados">
    <TablaAbogados />
  </div>


  {/* Formulario de registro */}
  <div className="formulario-cliente">
    {/* Aquí va tu formulario */}
    <FormCliente />
  </div>
    
    {/* Tabla Salas */}
  <div className="tabla-sala">
    <TablaSalas />
  </div>

    {/* Tabla de clientes debajo */}
    <div className="tabla-clientes">
    <TablaClientes />
    </div>
</div>
  );
};

export default Home;
