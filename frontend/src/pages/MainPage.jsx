// frontend/src/pages/MainPage.jsx
import React, { useMemo, useState } from 'react';
import './MainPage.css';
import FormAbogado from '../components/FormAbogado';
import RegistrarCliente from '../pages/Home';
import Protocolito from '../components/Protocolito';
import Recibo from '../components/ReciboNotaria17';
import ConsultarRecibos from '../components/ConsultarRecibos'; // ← NUEVO
import Escrituras from '../components/Escrituras';
import RegistrarGenerales from '../components/RegistrarGenerales';
import ConsultarGenerales from '../components/ConsultarGenerales';

import { useAuth } from '../auth/AuthContext';
import Login from '../components/Login';

export default function MainPage() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AuthedApp /> : <Login />;
}


function AuthedApp() {
  const { user, logout } = useAuth();
  const role = user?.role || '';

  const [seccion, setSeccion] = useState(role === 'PROTOCOLITO' ? 'registrar-generales' : 'registrar-cliente');
  const [mostrarSubmenu, setMostrarSubmenu] = useState(false);
  const [mostrarSubmenuRecibos, setMostrarSubmenuRecibos] = useState(false); // ← NUEVO
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [reciboRow, setReciboRow] = useState(null);

  const isMobile = () => window.innerWidth < 992;

  const go = (sec) => {
    setSeccion(sec);
    setMostrarSubmenu(false);
    setMostrarSubmenuRecibos(false); // ← cerrar submenu Recibos
    if (isMobile()) setSidebarOpen(false);
  };

  const renderContenido = () => {
    // 🔒 Si el usuario es PROTOCOLITO, SIEMPRE ve RegistrarGenerales
    if (role === 'PROTOCOLITO') {
      return <RegistrarGenerales />;
    }

    switch (seccion) {
      case 'registrar-cliente': return <RegistrarCliente />;
      case 'registrar-abogado': return <FormAbogado />;
      case 'registrar-generales': return <RegistrarGenerales />;
      case 'consultar-generales': return <ConsultarGenerales />;
      case 'protocolito':
        return (
          <Protocolito
            onOpenRecibo={(row) => {
              setReciboRow(row);
              setSeccion('recibo');
            }}
          />
        );
      case 'Escrituras':
        return (
          <Escrituras
            onOpenRecibo={(row) => {
              setReciboRow(row);
              setSeccion('recibo');
            }}
          />
        );
      case 'recibo':
        return <Recibo row={reciboRow} onBack={() => setSeccion('protocolito')} />;
      case 'recibos-consultar':
        return (
          <ConsultarRecibos
            onOpenRecibo={(row) => { setReciboRow(row); setSeccion('recibo'); }}
          />
        );
      default: return <RegistrarCliente />;
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
      <aside
        className={`sidebar ${sidebarOpen ? 'expanded' : 'collapsed'}`}
        style={sidebarStyle}
      >
        <button
          className="sidebar-handle"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Ocultar' : 'Mostrar'}
        >
          {sidebarOpen ? '❮' : '❯'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
          <span style={iconStyle}>⚖️</span>
          {sidebarOpen && <div className="sidebar-title" style={{ fontWeight: 700 }}>Notaría 17</div>}
        </div>
        <hr style={{ borderColor: '#374151', margin: '6px 0' }} />

        <div style={{ overflowY: 'auto' }}>
          <ul style={{ padding: 0, margin: 0 }}>
            {role === 'PROTOCOLITO' ? (
              // 🔒 MENÚ ESPECIAL PARA PROTOCOLITO
              <li
                style={itemStyle}
                title="Registrar Generales"
                onClick={() => go('registrar-generales')}
              >
                <span style={iconStyle}>📚</span>
                {sidebarOpen && <span>Registrar Generales</span>}
              </li>
            ) : (
              // 🌐 MENÚ NORMAL PARA ADMIN Y DEMÁS ROLES
              <>
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
                    <li style={{ ...itemStyle, padding: '8px 6px' }} onClick={() => go('registrar-generales')}>
                      <span style={iconStyle}>📚</span><span>Registrar Generales</span>
                    </li>
                    <li style={{ ...itemStyle, padding: '8px 6px' }} onClick={() => go('consultar-generales')}>
                      <span style={iconStyle}>🔎</span><span>Consultar Generales</span>
                    </li>

                    {role === 'admin' && (
                      <li style={{ ...itemStyle, padding: '8px 6px' }} onClick={() => go('registrar-abogado')}>
                        <span style={iconStyle}>👨‍⚖️</span><span>Registrar Abogado</span>
                      </li>
                    )}
                  </ul>
                )}

                {/* Recibos (submenu) */}
                <li
                  style={itemStyle}
                  className="submenu"
                  title="Recibos"
                  onClick={() => {
                    if (!sidebarOpen) { setSidebarOpen(true); return; }
                    setMostrarSubmenuRecibos(v => !v);
                  }}
                >
                  <span style={iconStyle}>📄</span>
                  {sidebarOpen && <span>Recibos ▾</span>}
                </li>
                {sidebarOpen && mostrarSubmenuRecibos && (
                  <ul style={{ listStyle: 'none', paddingLeft: 40, marginTop: 4, marginBottom: 8 }}>
                    <li style={{ ...itemStyle, padding: '8px 6px' }} onClick={() => go('recibo')}>
                      <span style={iconStyle}>➕</span><span>Generar recibo</span>
                    </li>
                    <li style={{ ...itemStyle, padding: '8px 6px' }} onClick={() => go('recibos-consultar')}>
                      <span style={iconStyle}>🗂️</span><span>Consultar recibos</span>
                    </li>
                  </ul>
                )}

                {/* Protocolito */}
                <li title="Protocolito" style={itemStyle} onClick={() => go('protocolito')}>
                  <span style={iconStyle}>📑</span>{sidebarOpen && <span>Protocolito</span>}
                </li>

                {/* Escrituras */}
                <li title="Escrituras" style={itemStyle} onClick={() => go('Escrituras')}>
                  <span style={iconStyle}>🔍</span>{sidebarOpen && <span>Escrituras</span>}
                </li>
              </>
            )}
          </ul>
        </div>

        {/* FOOTER */}
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

      <main className="contenido" style={mainStyle}>
        {renderContenido()}
      </main>
    </div>
  );
}
