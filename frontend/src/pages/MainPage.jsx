// frontend/src/pages/MainPage.jsx
import React, { useMemo, useState } from 'react';
import './MainPage.css';
import FormAbogado from '../components/FormAbogado';
import RegistrarCliente from '../pages/Home';
import Protocolito from '../components/Protocolito';
import Recibo from '../components/ReciboNotaria17';

import { useAuth } from '../auth/AuthContext';
import Login from '../components/Login';

/** Conmutador: si no hay sesión -> Login; si hay sesión -> app */
export default function MainPage() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AuthedApp /> : <Login />;
}

/** Todo el layout con hooks va aquí (sin condicionales alrededor) */
function AuthedApp() {
  const { user, logout } = useAuth(); // ← user: { id/_id, role }, logout()

  const [seccion, setSeccion] = useState('registrar-cliente');
  const [mostrarSubmenu, setMostrarSubmenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isMobile = () => window.innerWidth < 992;

  const go = (sec) => {
    setSeccion(sec);
    setMostrarSubmenu(false);
    if (isMobile()) setSidebarOpen(false);
  };

  const renderContenido = () => {
    switch (seccion) {
      case 'registrar-cliente': return <RegistrarCliente />;
      case 'registrar-abogado': return <FormAbogado />;
      case 'protocolito':       return <Protocolito />;
      case 'recibo':       return <Recibo/>;
      default:                  return <RegistrarCliente />;
    }
  };

  const sidebarStyle = useMemo(() => ({
    background: '#1f2937',
    color: '#fff',
    width: sidebarOpen ? 250 : 60,
    transition: 'width .25s ease',
    overflow: 'hidden',
    padding: sidebarOpen ? '16px 16px' : '16px 8px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    position: 'relative',
    minHeight: '100vh'
  }), [sidebarOpen]);

  const mainStyle = useMemo(() => ({
    flex: 1,
    padding: 10,
    background: '#f6f7fb',
  }), []);

  const itemStyle = {
    listStyle: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 8px',
    borderRadius: 8,
    cursor: 'pointer'
  };
  const iconStyle = { width: 28, textAlign: 'center', fontSize: 18 };

  return (
    <div className="main-layout">
      {/* SIDEBAR */}
      <aside
        className={`sidebar ${sidebarOpen ? 'expanded' : 'collapsed'}`}
        style={sidebarStyle}
      >
        {/* Handle */}
        <button
          className="sidebar-handle"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Ocultar' : 'Mostrar'}
        >
          {sidebarOpen ? '❮' : '❯'}
        </button>

        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
          <span style={iconStyle}>⚖️</span>
          {sidebarOpen && <div className="sidebar-title" style={{ fontWeight: 700 }}>Notaría 17</div>}
        </div>
        <hr style={{ borderColor: '#374151', margin: '6px 0' }} />

        {/* Menú */}
        <div style={{ overflowY: 'auto' }}>
          <ul style={{ padding: 0, margin: 0 }}>
            {/* Registrar (submenu) */}
            <li
              style={itemStyle}
              className="submenu"
              title="Registrar"
              onClick={() => {
                if (!sidebarOpen) { setSidebarOpen(true); return; }
                setMostrarSubmenu(v => !v);
              }}
            >
              <span className="icon" style={iconStyle}>📋</span>
              {sidebarOpen && <span>Registrar ▾</span>}
            </li>

            {sidebarOpen && mostrarSubmenu && (
              <ul style={{ listStyle: 'none', paddingLeft: 40, marginTop: 4, marginBottom: 8 }}>
                <li style={{ ...itemStyle, padding: '8px 6px' }} onClick={() => go('registrar-cliente')}>
                  <span style={iconStyle}>👤</span><span>Registrar Cliente</span>
                </li>

                {/* Solo ADMIN ve "Registrar Abogado" */}
                {user?.role === 'admin' && (
                  <li style={{ ...itemStyle, padding: '8px 6px' }} onClick={() => go('registrar-abogado')}>
                    <span style={iconStyle}>👨‍⚖️</span><span>Registrar Abogado</span>
                  </li>
                )}
              </ul>
            )}

            {/* Items simples */}
            <li title="Buscar Cliente" style={itemStyle} onClick={() => go('buscar')}>
              <span style={iconStyle}>🔍</span>{sidebarOpen && <span>Escrituras</span>}
            </li>
            <li title="Recibos" style={itemStyle} onClick={() => go('recibo')}>
              <span style={iconStyle}>📄</span>{sidebarOpen && <span>Recibos</span>}
            </li>
             {/*<li title="Asesorías Pendientes" style={itemStyle} onClick={() => go('asesorias')}>
              <span style={iconStyle}>📘</span>{sidebarOpen && <span>Asesorías Pendientes</span>}
            </li>*/}
            <li title="Protocolito" style={itemStyle} onClick={() => go('protocolito')}>
              <span style={iconStyle}>📑</span>{sidebarOpen && <span>Protocolito</span>}
            </li>
          </ul>
        </div>

        {/* FOOTER DEL SIDEBAR (usuario + logout) */}
        <div
          style={{
            marginTop: 'auto',
            borderTop: '1px solid #374151',
            paddingTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          {sidebarOpen ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                <div><b>ID</b> {user?._id || user?.id || '-'}</div>
                <div><b>Rol</b> {user?.role || '-'}</div>
              </div>
              <button
                onClick={logout}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <button
              onClick={logout}
              title="Cerrar sesión"
              style={{
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                padding: 8,
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              ⎋
            </button>
          )}
        </div>
      </aside>

      {/* CONTENIDO */}
      <main className="contenido" style={mainStyle}>
        {renderContenido()}
      </main>
    </div>
  );
}
