// frontend/src/pages/MainPage.jsx
import React, { useState, useEffect } from 'react';
import './MainPage.css';

// MUI Icons
import GavelIcon          from '@mui/icons-material/Gavel';
import PeopleAltIcon      from '@mui/icons-material/PeopleAlt';
import PersonAddIcon      from '@mui/icons-material/PersonAdd';
import LibraryBooksIcon   from '@mui/icons-material/LibraryBooks';
import ManageSearchIcon   from '@mui/icons-material/ManageSearch';
import BadgeIcon          from '@mui/icons-material/Badge';
import ReceiptLongIcon    from '@mui/icons-material/ReceiptLong';
import AddCardIcon        from '@mui/icons-material/AddCard';
import FolderOpenIcon     from '@mui/icons-material/FolderOpen';
import DescriptionIcon    from '@mui/icons-material/Description';
import MenuBookIcon       from '@mui/icons-material/MenuBook';
import RequestQuoteIcon   from '@mui/icons-material/RequestQuote';
import CalendarMonthIcon  from '@mui/icons-material/CalendarMonth';
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined';
import LogoutIcon         from '@mui/icons-material/Logout';
import ChevronLeftIcon    from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon   from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon     from '@mui/icons-material/ExpandMore';
import ExpandLessIcon     from '@mui/icons-material/ExpandLess';

import FormAbogado        from '../components/FormAbogado';
import RegistrarCliente   from '../pages/Home';
import Protocolito        from '../components/Protocolito';
import Recibo             from '../components/ReciboNotaria17';
import ConsultarRecibos   from '../components/ConsultarRecibos';
import Escrituras         from '../components/Escrituras';
import RegistrarGenerales from '../components/RegistrarGenerales';
import ConsultarGenerales from '../components/ConsultarGenerales';
import Presupuesto        from '../components/Presupuesto';
import Calendario         from '../components/Calendario';
import PLDSeccion         from '../components/pld/PLDSeccion';

import { useAuth } from '../auth/AuthContext';
import Login from '../components/Login';

const SECTION_LABELS = {
  'registrar-cliente':   'Registrar Cliente',
  'registrar-abogado':   'Gestión de Abogados',
  'registrar-generales': 'Registrar Generales',
  'consultar-generales': 'Consultar Generales',
  'protocolito':         'Protocolito',
  'Escrituras':          'Escrituras',
  'escritura-estatus':   'Estatus de Escritura',
  'recibo':              'Recibos',
  'recibos-consultar':   'Consultar Recibos',
  'presupuesto':         'Presupuesto',
  'calendario':          'Calendario',
  'ExpedientesPLD':      'Expedientes PLD',
};

export default function MainPage() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AuthedApp /> : <Login />;
}

function AuthedApp() {
  const { user, logout } = useAuth();
  const role = user?.role || '';
  // Permiso del submenú "Expedientes PLD" — inicialmente solo Administrador,
  // mismo criterio ya usado para "Registrar Abogado" más abajo. El módulo
  // PLD en sí (ExpedientePLD, sus tabs) sigue teniendo su propio control de
  // permisos interno (puedeEditarPLD/puedePresentarPLD, sin cambios aquí).
  const puedeVerExpedientesPLD = role === 'ADMIN' || role === 'admin';

  const INACTIVITY_LIMIT = 60 * 60 * 1000;

  useEffect(() => {
    const touchActivity = () => localStorage.setItem('lastActivity', String(Date.now()));
    window.addEventListener('click',     touchActivity);
    window.addEventListener('keydown',   touchActivity);
    window.addEventListener('mousemove', touchActivity);
    touchActivity();

    const intervalId = setInterval(() => {
      const last = Number(localStorage.getItem('lastActivity') || 0);
      if (!last) return;
      if (Date.now() - last > INACTIVITY_LIMIT) {
        clearInterval(intervalId);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('lastActivity');
        logout();
      }
    }, 1000);

    return () => {
      window.removeEventListener('click',     touchActivity);
      window.removeEventListener('keydown',   touchActivity);
      window.removeEventListener('mousemove', touchActivity);
      clearInterval(intervalId);
    };
  }, [logout, INACTIVITY_LIMIT]);

  const [seccion,               setSeccion]               = useState(role === 'PROTOCOLITO' ? 'registrar-generales' : 'registrar-cliente');
  const [mostrarSubmenu,           setMostrarSubmenu]           = useState(false);
  const [mostrarSubmenuRecibos,    setMostrarSubmenuRecibos]    = useState(false);
  const [mostrarSubmenuEscrituras, setMostrarSubmenuEscrituras] = useState(false);
  const [sidebarOpen,           setSidebarOpen]           = useState(true);
  const [reciboRow,             setReciboRow]             = useState(null);

  const isMobile = () => window.innerWidth < 992;

  const go = (sec) => {
    setSeccion(sec);
    setMostrarSubmenu(false);
    setMostrarSubmenuRecibos(false);
    setMostrarSubmenuEscrituras(false);
    if (isMobile()) setSidebarOpen(false);
  };

  useEffect(() => {
    const target = localStorage.getItem('postLoginGoTo');
    if (target) {
      localStorage.removeItem('postLoginGoTo');
      go(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderContenido = () => {
    if (role === 'PROTOCOLITO') return <RegistrarGenerales />;

    switch (seccion) {
      case 'registrar-cliente':   return <RegistrarCliente />;
      case 'registrar-abogado':   return <FormAbogado />;
      case 'registrar-generales': return <RegistrarGenerales />;
      case 'consultar-generales': return <ConsultarGenerales />;
      case 'protocolito':
        return (
          <Protocolito
            onOpenRecibo={(row) => { setReciboRow(row); setSeccion('recibo'); }}
          />
        );
      case 'Escrituras':
        return (
          <Escrituras
            onOpenRecibo={(row) => { setReciboRow(row); setSeccion('recibo'); }}
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
      case 'presupuesto': return <Presupuesto />;
      case 'calendario':  return <Calendario />;
      case 'ExpedientesPLD':
        return puedeVerExpedientesPLD ? <PLDSeccion /> : <RegistrarCliente />;
      default:            return <RegistrarCliente />;
    }
  };

  const registrarActive = ['registrar-cliente', 'registrar-generales', 'consultar-generales', 'registrar-abogado'].includes(seccion);
  const recibosActive   = ['recibo', 'recibos-consultar'].includes(seccion);
  const escriturasActive = ['Escrituras', 'ExpedientesPLD'].includes(seccion);

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const isz = { fontSize: 20 };

  return (
    <div className="main-layout">

      {/* ── SIDEBAR ── */}
      <aside className={`sidebar ${sidebarOpen ? 'expanded' : 'collapsed'}`}>

        <button
          className="sidebar-handle"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
        >
          {sidebarOpen
            ? <ChevronLeftIcon sx={{ fontSize: 18 }} />
            : <ChevronRightIcon sx={{ fontSize: 18 }} />}
        </button>

        {/* Brand */}
        <div className="sidebar-brand">
          {sidebarOpen ? (
            <>
              <img src="/logo.png" alt="Notaría 17" className="sidebar-logo" />
              <span className="sidebar-brand-text">Notaría 17</span>
            </>
          ) : (
            <GavelIcon sx={{ fontSize: 26, color: '#60a5fa' }} />
          )}
        </div>

        <hr className="sidebar-divider" />

        {/* Nav items */}
        <ul className="sidebar-nav">
          {role === 'PROTOCOLITO' ? (
            <li
              className={`nav-item ${seccion === 'registrar-generales' ? 'active' : ''}`}
              onClick={() => go('registrar-generales')}
              title="Registrar Generales"
            >
              <LibraryBooksIcon sx={isz} />
              {sidebarOpen && <span>Registrar Generales</span>}
            </li>
          ) : (
            <>
              {/* ── Registrar (submenu) ── */}
              <li
                className={`nav-item ${registrarActive ? 'active' : ''}`}
                title="Registrar"
                onClick={() => {
                  if (!sidebarOpen) { setSidebarOpen(true); return; }
                  setMostrarSubmenu((v) => !v);
                  setMostrarSubmenuRecibos(false);
                }}
              >
                <PeopleAltIcon sx={isz} />
                {sidebarOpen && (
                  <>
                    <span style={{ flex: 1 }}>Registrar</span>
                    {mostrarSubmenu
                      ? <ExpandLessIcon sx={{ fontSize: 16 }} />
                      : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                  </>
                )}
              </li>
              {sidebarOpen && mostrarSubmenu && (
                <ul className="nav-submenu">
                  <li className={`nav-sub-item ${seccion === 'registrar-cliente' ? 'active' : ''}`}
                      onClick={() => go('registrar-cliente')}>
                    <PersonAddIcon sx={{ fontSize: 17 }} />
                    <span>Registrar Cliente</span>
                  </li>
                  <li className={`nav-sub-item ${seccion === 'registrar-generales' ? 'active' : ''}`}
                      onClick={() => go('registrar-generales')}>
                    <LibraryBooksIcon sx={{ fontSize: 17 }} />
                    <span>Registrar Generales</span>
                  </li>
                  <li className={`nav-sub-item ${seccion === 'consultar-generales' ? 'active' : ''}`}
                      onClick={() => go('consultar-generales')}>
                    <ManageSearchIcon sx={{ fontSize: 17 }} />
                    <span>Consultar Generales</span>
                  </li>
                  {(role === 'ADMIN' || role === 'admin') && (
                    <li className={`nav-sub-item ${seccion === 'registrar-abogado' ? 'active' : ''}`}
                        onClick={() => go('registrar-abogado')}>
                      <BadgeIcon sx={{ fontSize: 17 }} />
                      <span>Registrar Abogado</span>
                    </li>
                  )}
                </ul>
              )}

              {/* ── Recibos (submenu) ── */}
              <li
                className={`nav-item ${recibosActive ? 'active' : ''}`}
                title="Recibos"
                onClick={() => {
                  if (!sidebarOpen) { setSidebarOpen(true); return; }
                  setMostrarSubmenuRecibos((v) => !v);
                  setMostrarSubmenu(false);
                }}
              >
                <ReceiptLongIcon sx={isz} />
                {sidebarOpen && (
                  <>
                    <span style={{ flex: 1 }}>Recibos</span>
                    {mostrarSubmenuRecibos
                      ? <ExpandLessIcon sx={{ fontSize: 16 }} />
                      : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                  </>
                )}
              </li>
              {sidebarOpen && mostrarSubmenuRecibos && (
                <ul className="nav-submenu">
                  <li className={`nav-sub-item ${seccion === 'recibo' ? 'active' : ''}`}
                      onClick={() => go('recibo')}>
                    <AddCardIcon sx={{ fontSize: 17 }} />
                    <span>Generar recibo</span>
                  </li>
                  <li className={`nav-sub-item ${seccion === 'recibos-consultar' ? 'active' : ''}`}
                      onClick={() => go('recibos-consultar')}>
                    <FolderOpenIcon sx={{ fontSize: 17 }} />
                    <span>Consultar recibos</span>
                  </li>
                </ul>
              )}

              {/* ── Protocolito ── */}
              <li className={`nav-item ${seccion === 'protocolito' ? 'active' : ''}`}
                  title="Protocolito" onClick={() => go('protocolito')}>
                <DescriptionIcon sx={isz} />
                {sidebarOpen && <span>Protocolito</span>}
              </li>

              {/* ── Escrituras (submenu) ── */}
              <li
                className={`nav-item ${escriturasActive ? 'active' : ''}`}
                title="Escrituras"
                onClick={() => {
                  if (!sidebarOpen) { setSidebarOpen(true); return; }
                  setMostrarSubmenuEscrituras((v) => !v);
                  setMostrarSubmenu(false);
                  setMostrarSubmenuRecibos(false);
                }}
              >
                <MenuBookIcon sx={isz} />
                {sidebarOpen && (
                  <>
                    <span style={{ flex: 1 }}>Escrituras</span>
                    {mostrarSubmenuEscrituras
                      ? <ExpandLessIcon sx={{ fontSize: 16 }} />
                      : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                  </>
                )}
              </li>
              {sidebarOpen && mostrarSubmenuEscrituras && (
                <ul className="nav-submenu">
                  <li className={`nav-sub-item ${seccion === 'Escrituras' ? 'active' : ''}`}
                      onClick={() => go('Escrituras')}>
                    <MenuBookIcon sx={{ fontSize: 17 }} />
                    <span>Escrituras</span>
                  </li>
                  {puedeVerExpedientesPLD && (
                    <li className={`nav-sub-item ${seccion === 'ExpedientesPLD' ? 'active' : ''}`}
                        onClick={() => go('ExpedientesPLD')}>
                      <PolicyOutlinedIcon sx={{ fontSize: 17 }} />
                      <span>Expedientes PLD</span>
                    </li>
                  )}
                </ul>
              )}

              {/* ── Presupuesto ── */}
              <li className={`nav-item ${seccion === 'presupuesto' ? 'active' : ''}`}
                  title="Presupuesto" onClick={() => go('presupuesto')}>
                <RequestQuoteIcon sx={isz} />
                {sidebarOpen && <span>Presupuesto</span>}
              </li>

              {/* ── Calendario ── */}
              <li className={`nav-item ${seccion === 'calendario' ? 'active' : ''}`}
                  title="Calendario" onClick={() => go('calendario')}>
                <CalendarMonthIcon sx={isz} />
                {sidebarOpen && <span>Calendario</span>}
              </li>
            </>
          )}
        </ul>

        {/* Footer */}
        <div className="sidebar-footer">
          {sidebarOpen ? (
            <>
              <div className="sidebar-user-info">
                <span className="user-name">{user?.nombre || '-'}</span>
                <span className="user-meta">ID {user?._id || user?.id || '-'} · {user?.role || '-'}</span>
              </div>
              <button className="btn-logout btn-logout-full" onClick={logout}>
                <LogoutIcon sx={{ fontSize: 17 }} />
                <span>Cerrar sesión</span>
              </button>
            </>
          ) : (
            <button className="btn-logout btn-logout-icon" onClick={logout} title="Cerrar sesión">
              <LogoutIcon sx={{ fontSize: 18 }} />
            </button>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div
        className="main-content-wrapper"
        style={{ marginLeft: sidebarOpen ? 240 : 64 }}
      >
        {/* Top bar */}
        <header className="topbar">
          <h1 className="topbar-title">
            {SECTION_LABELS[seccion] || 'Notaría 17'}
          </h1>
          <div className="topbar-right">
            <span className="topbar-date">{today}</span>
            <div className="topbar-user">
              <span className="topbar-user-id">{user?.nombre || user?._id || user?.id}</span>
              <span className="topbar-user-role">{user?.role}</span>
            </div>
          </div>
        </header>

        <main className="contenido">
          {renderContenido()}
        </main>
      </div>
    </div>
  );
}
