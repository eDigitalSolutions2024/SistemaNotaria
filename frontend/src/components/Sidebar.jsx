import React from 'react';

const Sidebar = ({ setSeccion }) => {
  return (
    <div className="sidebar bg-dark text-white p-3" style={{ height: '100vh', width: '250px' }}>
      <h3>⚖️ Notaría 17</h3>
      <hr className="bg-secondary" />

      <ul className="nav flex-column">
        <li className="nav-item">
          <a href="#" onClick={() => setSeccion('dashboard')} className="nav-link text-white">Dashboard</a>
        </li>
        <hr className="bg-secondary" />
        <li>
          <span className="text-white">Registrar ▾</span>
          <ul className="ms-3">
            <li><a href="#" onClick={() => setSeccion('registrarCliente')} className="nav-link text-white">Registrar Cliente</a></li>
            <li><a href="#" onClick={() => setSeccion('registrarAbogado')} className="nav-link text-white">Registrar Abogado</a></li>
          </ul>
        </li>
        <hr className="bg-secondary" />
        <li className="nav-item">
          <a href="#" onClick={() => setSeccion('buscar')} className="nav-link text-white">Buscar Cliente</a>
        </li>
        <li className="nav-item">
          <a href="#" onClick={() => setSeccion('tramites')} className="nav-link text-white">Trámites Pendientes</a>
        </li>
        <li className="nav-item">
          <a href="#" onClick={() => setSeccion('asesorias')} className="nav-link text-white">Asesorías Pendientes</a>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;
