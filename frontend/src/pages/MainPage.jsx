// frontend/src/pages/MainPage.jsx
import React, { useState } from 'react';
import './MainPage.css';
//import FormCliente from '../components/FormCliente';
import FormAbogado from '../components/FormAbogado';
//import TablaClientes from '../components/TablaClientes';
//import TablaAbogados from '../components/AbogadosTable';
import RegistrarCliente from '../pages/Home';

// ...




const MainPage = () => {
  const [seccion, setSeccion] = useState('registratr-cliente');
  const [mostrarSubmenu, setMostrarSubmenu] = useState(false);


  const renderContenido = () => {
    switch (seccion) {
      case 'registrar-cliente':
        return <RegistrarCliente />;
      case 'registrar-abogado':
        return <FormAbogado />;
      /*case 'tabla-clientes':
        return <TablaClientes />;
      case 'tabla-abogados':
        return <TablaAbogados />;*/
      default:
        return <RegistrarCliente />;
    }
  };

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <div className="sidebar-title">⚖️ <strong>Notaría 17</strong></div>
        <hr />
        <ul>
       
          <li className="submenu" onClick={() => setMostrarSubmenu(!mostrarSubmenu)}>
            Registrar ▾
            {mostrarSubmenu && (
                <ul>
                <li onClick={() => setSeccion('registrar-cliente')}>Registrar Cliente</li>
                <li onClick={() => setSeccion('registrar-abogado')}>Registrar Abogado</li>
                </ul>
            )}
        </li>
        {/*
          <li onClick={() => setSeccion('tabla-clientes')}>Clientes</li>
          <li onClick={() => setSeccion('tabla-abogados')}>Abogados</li>
          */}
          <li>Buscar Cliente</li>
          <li>Trámites Pendientes</li>
          <li>Asesorías Pendientes</li>
        </ul>
      </aside>

      <main className="contenido">
        {renderContenido()}
      </main>
    </div>
  );
};

export default MainPage;
