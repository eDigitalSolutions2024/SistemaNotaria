// frontend/src/pages/MainPage.jsx
import React, { useMemo, useState, useEffect } from 'react';
import './MainPage.css';
import FormAbogado from '../components/FormAbogado';
import RegistrarCliente from '../pages/Home';
import Protocolito from '../components/Protocolito';
import Recibo from '../components/ReciboNotaria17';
import ConsultarRecibos from '../components/ConsultarRecibos';
import Escrituras from '../components/Escrituras';
import RegistrarGenerales from '../components/RegistrarGenerales';
import ConsultarGenerales from '../components/ConsultarGenerales';
import Presupuesto from '../components/Presupuesto';
import EscrituraEstatus from '../components/EscriturasEstatus';

import { useAuth } from '../auth/AuthContext';
import Login from '../components/Login';

export default function MainPage() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AuthedApp /> : <Login />;
}

function AuthedApp() {
  const { user, logout } = useAuth();
  const role = user?.role || '';

  // 🔴 LIMITE DE INACTIVIDAD
  const INACTIVITY_LIMIT = 60 * 60 * 1000;

  useEffect(() => {
    const touchActivity = () => {
      localStorage.setItem('lastActivity', String(Date.now()));
    };

    const handler = () => touchActivity();

    window.addEventListener('click', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('mousemove', handler);

    touchActivity();

    const intervalId = setInterval(() => {
      const raw = localStorage.getItem('lastActivity');
      const last = raw ? Number(raw) : 0;
      if (!last) return;

      const diff = Date.now() - last;

      if (diff > INACTIVITY_LIMIT) {
        clearInterval(intervalId);

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('lastActivity');

        logout();
      }
    }, 1000);

    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('mousemove', handler);
      clearInterval(intervalId);
    };
  }, [logout, INACTIVITY_LIMIT]);

  const [seccion, setSeccion] = useState(
    role === 'PROTOCOLITO' ? 'registrar-generales' : 'registrar-cliente'
  );
  const [mostrarSubmenu, setMostrarSubmenu] = useState(false);
  const [mostrarSubmenuRecibos, setMostrarSubmenuRecibos] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [reciboRow, setReciboRow] = useState(null);

  // ✅ NUEVO: escritura seleccionada para pantalla de estatus
  const [escrituraEstatusRow, setEscrituraEstatusRow] = useState(null);

  const isMobile = () => window.innerWidth < 992;

  const go = (sec) => {
    setSeccion(sec);
    setMostrarSubmenu(false);
    setMostrarSubmenuRecibos(false);
    if (isMobile()) setSidebarOpen(false);
  };

  const renderContenido = () => {
    // 🔒 Si el usuario es PROTOCOLITO, SIEMPRE ve RegistrarGenerales
    if (role === 'PROTOCOLITO') {
      return <RegistrarGenerales />;
    }

    switch (seccion) {
      case 'registrar-cliente':
        return <RegistrarCliente />;

      case 'registrar-abogado':
        return <FormAbogado />;

      case 'registrar-generales':
        return <RegistrarGenerales />;

      case 'consultar-generales':
        return <ConsultarGenerales />;

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
            // ✅ NUEVO: SOLO se abre al doble click (lo disparas desde Escrituras.jsx)
            onOpenEstatus={(row) => {
              setEscrituraEstatusRow(row);
              setSeccion('escritura-estatus');
            }}
          />
        );

      // ✅ NUEVO: pantalla del estatus de escritura (se entra por doble click)
      case 'escritura-estatus':
        return (
          <EscrituraEstatus
            row={escrituraEstatusRow}
            onBack={() => setSeccion('Escrituras')}
          />
        );

      case 'recibo':
        return <Recibo row={reciboRow} onBack={() => setSeccion('protocolito')} />;

      case 'recibos-consultar':
        return (
          <ConsultarRecibos
            onOpenRecibo={(row) => {
              setReciboRow(row);
              setSeccion('recibo');
            }}
          />
        );

      case 'presupuesto':
        return <Presupuesto />;

      default:
        return <RegistrarCliente />;
    }
  };

  const sidebarStyle = useMemo(
    () => ({
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
      minHeight: '100vh',
    }),
    [sidebarOpen]
  );

  const mainStyle = useMemo(
    () => ({
      flex: 1,
      padding: 10,
      background: '#f6f7fb',
    }),
    []
  );

  const itemStyle = {
    listStyle: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 8px',
    borderRadius: 8,
    cursor: 'pointer',
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
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Ocultar' : 'Mostrar'}
        >
          {sidebarOpen ? '❮' : '❯'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
          <span style={iconStyle}>⚖️</span>
          {sidebarOpen && (
            <div className="sidebar-title" style={{ fontWeight: 700 }}>
              Notaría 17
            </div>
          )}
        </div>
        <hr style={{ borderColor: '#374151', margin: '6px 0' }} />

        <div style={{ overflowY: 'auto' }}>
          <ul style={{ padding: 0, margin: 0 }}>
            {role === 'PROTOCOLITO' ? (
              <li
                style={itemStyle}
                title="Registrar Generales"
                onClick={() => go('registrar-generales')}
              >
                <span style={iconStyle}>📚</span>
                {sidebarOpen && <span>Registrar Generales</span>}
              </li>
            ) : (
              <>
                {/* Registrar (submenu) */}
                <li
                  style={itemStyle}
                  className="submenu"
                  title="Registrar"
                  onClick={() => {
                    if (!sidebarOpen) {
                      setSidebarOpen(true);
                      return;
                    }
                    setMostrarSubmenu((v) => !v);
                  }}
                >
                  <span className="icon" style={iconStyle}>
                    📋
                  </span>
                  {sidebarOpen && <span>Registrar ▾</span>}
                </li>
                {sidebarOpen && mostrarSubmenu && (
                  <ul style={{ listStyle: 'none', paddingLeft: 40, marginTop: 4, marginBottom: 8 }}>
                    <li
                      style={{ ...itemStyle, padding: '8px 6px' }}
                      onClick={() => go('registrar-cliente')}
                    >
                      <span style={iconStyle}>👤</span>
                      <span>Registrar Cliente</span>
                    </li>
                    <li
                      style={{ ...itemStyle, padding: '8px 6px' }}
                      onClick={() => go('registrar-generales')}
                    >
                      <span style={iconStyle}>📚</span>
                      <span>Registrar Generales</span>
                    </li>
                    <li
                      style={{ ...itemStyle, padding: '8px 6px' }}
                      onClick={() => go('consultar-generales')}
                    >
                      <span style={iconStyle}>🔎</span>
                      <span>Consultar Generales</span>
                    </li>

                    {role === 'admin' && (
                      <li
                        style={{ ...itemStyle, padding: '8px 6px' }}
                        onClick={() => go('registrar-abogado')}
                      >
                        <span style={iconStyle}>👨‍⚖️</span>
                        <span>Registrar Abogado</span>
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
                    if (!sidebarOpen) {
                      setSidebarOpen(true);
                      return;
                    }
                    setMostrarSubmenuRecibos((v) => !v);
                  }}
                >
                  <span style={iconStyle}>📄</span>
                  {sidebarOpen && <span>Recibos ▾</span>}
                </li>
                {sidebarOpen && mostrarSubmenuRecibos && (
                  <ul style={{ listStyle: 'none', paddingLeft: 40, marginTop: 4, marginBottom: 8 }}>
                    <li
                      style={{ ...itemStyle, padding: '8px 6px' }}
                      onClick={() => go('recibo')}
                    >
                      <span style={iconStyle}>➕</span>
                      <span>Generar recibo</span>
                    </li>
                    <li
                      style={{ ...itemStyle, padding: '8px 6px' }}
                      onClick={() => go('recibos-consultar')}
                    >
                      <span style={iconStyle}>🗂️</span>
                      <span>Consultar recibos</span>
                    </li>
                  </ul>
                )}

                {/* Protocolito */}
                <li title="Protocolito" style={itemStyle} onClick={() => go('protocolito')}>
                  <span style={iconStyle}>📑</span>
                  {sidebarOpen && <span>Protocolito</span>}
                </li>

                {/* Escrituras */}
                <li title="Escrituras" style={itemStyle} onClick={() => go('Escrituras')}>
                  <span style={iconStyle}>🔍</span>
                  {sidebarOpen && <span>Escrituras</span>}
                </li>

                {/* Presupuesto */}
                <li title="Presupuesto" style={itemStyle} onClick={() => go('presupuesto')}>
                  <span style={iconStyle}>📑</span>
                  {sidebarOpen && <span>Presupuesto</span>}
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
            gap: 6,
          }}
        >
          {sidebarOpen ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                <div>
                  <b>ID</b> {user?._id || user?.id || '-'}
                </div>
                <div>
                  <b>Rol</b> {user?.role || '-'}
                </div>
              </div>
              <button
                onClick={logout}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
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
                cursor: 'pointer',
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
