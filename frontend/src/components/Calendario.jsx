import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";

import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import NuevoEventoModal from "./NuevoEventoModal";

import "../css/Calendario.css";

// Misma URL de API que usa el resto del sistema (REACT_APP_API_URL); así el
// token JWT de la sesión se valida contra el mismo backend que lo emitió.
const CAL_API = (process.env.REACT_APP_API_URL || "http://localhost:8020/api").replace(/\/+$/, "");
const PRIMARY_ID = "primary";

// Paleta para distinguir calendarios (el primero es el principal).
const PALETTE = [
  "#2563eb", // azul
  "#0d9488", // verde azulado
  "#d97706", // ámbar
  "#9333ea", // violeta
  "#e11d48", // rosa
  "#0891b2", // cian
  "#65a30d", // lima
  "#db2777", // fucsia
];

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Mezcla un color hex con blanco (t = 0..1 de color original) -> tono pastel
// igual al que usa Outlook para rellenar las citas.
function pastel(hex, t = 0.28) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c * t + 255 * (1 - t));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// "10 AM", "9:30 AM", "12 PM" (como Outlook)
function fmtOutlookTime(d) {
  if (!d) return "";
  const h = d.getHours();
  const min = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return min ? `${h12}:${String(min).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
}

function fmt(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("es-MX");
  } catch {
    return String(dt);
  }
}

// "jueves, 12 de noviembre de 2026 · 10:00 – 11:00"
function fmtRange(start, end, allDay) {
  if (!start) return "";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d) =>
    d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hm = (d) => d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (allDay) {
    if (!e) return `${day(s)} · Todo el día`;
    // FullCalendar entrega el fin de eventos de día completo como exclusivo.
    const lastDay = new Date(e.getTime() - 24 * 3600 * 1000);
    return lastDay.toDateString() === s.toDateString()
      ? `${day(s)} · Todo el día`
      : `${day(s)} → ${day(lastDay)} · Todo el día`;
  }
  if (!e) return `${day(s)} · ${hm(s)}`;
  return s.toDateString() === e.toDateString()
    ? `${day(s)} · ${hm(s)} – ${hm(e)}`
    : `${day(s)} ${hm(s)} → ${day(e)} ${hm(e)}`;
}

function getJwt() {
  let t = localStorage.getItem("token") || "";
  t = t.trim();

  // si lo guardaron como "Bearer xxx"
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "");

  // si lo guardaron con comillas
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1);
  }

  return t;
}

export default function Calendario() {
  const calRef = useRef(null);

  const [calendars, setCalendars] = useState([]);
  const [primaryInfo, setPrimaryInfo] = useState({ name: "Principal", color: null });
  const [selectedIds, setSelectedIds] = useState(new Set([PRIMARY_ID]));
  const [loadingCals, setLoadingCals] = useState(false);
  const [ready, setReady] = useState(false); // lista de calendarios ya cargada
  const [loadingEv, setLoadingEv] = useState(false);
  // Caché de eventos por rango (60 s). Se reinicia al salir de la pantalla.
  const cacheRef = useRef(new Map());

  // Modal (click)
  const [modal, setModal] = useState({ open: false, event: null });

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const calendarNameById = useMemo(() => {
    const m = new Map();
    m.set(PRIMARY_ID, primaryInfo.name || "Principal");
    for (const c of calendars) m.set(c.id, c.name);
    return m;
  }, [calendars, primaryInfo]);

  // Color por calendario: el mismo que tiene en Outlook; si no viene, paleta.
  const colorById = useMemo(() => {
    const m = new Map();
    m.set(PRIMARY_ID, primaryInfo.color || PALETTE[0]);
    calendars.forEach((c, i) => m.set(c.id, c.color || PALETTE[(i + 1) % PALETTE.length]));
    return m;
  }, [calendars, primaryInfo]);
  const colorRef = useRef(colorById);
  colorRef.current = colorById;
  const colorFor = (id) => colorById.get(id) || PALETTE[0];

  const [connected, setConnected] = useState(null);
  const [account, setAccount] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [canConnect, setCanConnect] = useState(false); // solo ADMIN puede conectar
  const [canDelete, setCanDelete] = useState(false); // solo ADMIN y RECEPCION pueden borrar citas
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Conectar la cuenta de la notaría (solo ADMIN): el servidor emite la URL
  // de Microsoft con un "state" firmado.
  const connectOutlook = async () => {
    try {
      const resp = await fetch(`${CAL_API}/calendar/connect-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getJwt()}` },
        credentials: "include",
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.url) throw new Error(data?.mensaje || `HTTP ${resp.status}`);
      window.location.href = data.url;
    } catch (e) {
      alert("No se pudo iniciar la conexión con Outlook: " + (e?.message || e));
    }
  };

  // "Actualizar": el servidor trae de Outlook solo lo que cambió y la pantalla
  // se recarga desde su base de datos.
  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await fetch(`${CAL_API}/calendar/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getJwt()}` },
        credentials: "include",
      });
      const st = await fetch(`${CAL_API}/calendar/status`, {
        headers: { Authorization: `Bearer ${getJwt()}` },
        credentials: "include",
      });
      if (st.ok) setLastSync((await st.json())?.lastSync || null);
    } catch (e) {
      console.error("sync manual:", e);
    } finally {
      cacheRef.current.clear();
      calRef.current?.getApi().refetchEvents();
      setSyncing(false);
    }
  };

  // "hace 3 min" (se recalcula con cada render; basta para esta pantalla)
  const syncAgo = (() => {
    if (!lastSync) return "";
    const s = Math.max(0, Math.round((Date.now() - new Date(lastSync).getTime()) / 1000));
    if (s < 60) return "hace unos segundos";
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} d`;
  })();

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${CAL_API}/calendar/status`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getJwt()}`,
          },
          credentials: "include",
        });

        if (!resp.ok) {
          let detalle = "";
          try {
            detalle = (await resp.json())?.mensaje || "";
          } catch {}
          setStatusMsg(
            `No se pudo verificar la conexión (HTTP ${resp.status}${detalle ? `: ${detalle}` : ""}) en ${CAL_API}.`
          );
          setConnected(false);
          return;
        }
        const data = await resp.json();
        setAccount(data?.account || "");
        setCanConnect(!!data?.canConnect);
        setCanDelete(!!data?.canDelete);
        setLastSync(data?.lastSync || null);
        if (data?.error) setStatusMsg(String(data.error).slice(0, 200));
        setConnected(!!data?.connected);
      } catch (e) {
        console.error("status outlook error:", e);
        setStatusMsg("No se pudo contactar al servidor.");
        setConnected(false);
      }
    })();
  }, []);

  // Opción B: seleccionar principal + todos
  useEffect(() => {
    if (connected !== true) return; // ✅ NO cargues si no está conectado

    (async () => {
      try {
        setLoadingCals(true);
        const resp = await fetch(`${CAL_API}/calendar/calendars`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getJwt()}`,
          },
          credentials: "include",
        });

        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.calendars) ? data.calendars : [];
        if (data?.primary) setPrimaryInfo({ name: data.primary.name || "Principal", color: data.primary.color || null });
        setCalendars(list);

        const next = new Set([PRIMARY_ID]);
        for (const c of list) next.add(c.id);
        setSelectedIds(next);
      } catch (e) {
        console.error("Error cargando calendarios:", e);
        setCalendars([]);
        setSelectedIds(new Set([PRIMARY_ID]));
      } finally {
        setLoadingCals(false);
        setReady(true); // ya se conoce la lista de calendarios: ahora sí, una sola carga de eventos
      }
    })();
  }, [connected]);

  const selKey = selectedIdsArray.join(",");

  // Calendarios que no se pudieron leer en la última carga (p. ej. Outlook
  // limitó las consultas). Se avisa en pantalla y "Reintentar" solo vuelve a
  // pedir esos, porque los demás ya están en caché.
  const [failedIds, setFailedIds] = useState(() => new Set());
  const markFailed = useCallback((calId, bad) => {
    setFailedIds((prev) => {
      if (prev.has(calId) === bad) return prev;
      const next = new Set(prev);
      if (bad) next.add(calId);
      else next.delete(calId);
      return next;
    });
  }, []);

  // Cerrar el detalle con Escape
  useEffect(() => {
    if (!modal.open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setModal({ open: false, event: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal.open]);

  // Pide (o reutiliza del caché) los eventos de UN calendario en un rango.
  // Devuelve una promesa; las peticiones en curso se comparten.
  const requestRange = useCallback((start, end, calId) => {
    const key = `${calId}|${ymd(start)}|${ymd(end)}`;
    const hit = cacheRef.current.get(key);
    if (hit && Date.now() - hit.ts < hit.ttl) return hit.promise;

    // Fechas "de calendario" (sin hora ni zona): el servidor lee de su base de
    // datos, que guarda las horas tal como las muestra Outlook. `to` es exclusivo.
    const params = new URLSearchParams({
      from: ymd(start),
      to: ymd(end),
      calendarIds: calId,
    });

    const promise = (async () => {
      const resp = await fetch(`${CAL_API}/calendar/events?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getJwt()}`,
        },
        credentials: "include",
      });
      if (resp.status === 401) {
        setConnected(false); // sesión de Outlook vencida -> pide reconectar
        throw new Error("La sesión de Outlook venció. Vuelve a conectar.");
      }
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      return {
        events: Array.isArray(data?.events) ? data.events : [],
        failed: Number(data?.failed) || 0,
        total: Number(data?.total) || 0,
      };
    })();

    // Caché corto (la lectura ya es instantánea); errores/incompleto no se guardan.
    cacheRef.current.set(key, { ts: Date.now(), ttl: 20_000, promise });
    promise
      .then((r) => {
        if (r.failed > 0) cacheRef.current.delete(key);
      })
      .catch(() => cacheRef.current.delete(key));
    return promise;
  }, []);

  // Cada calendario es su propia "fuente" de FullCalendar: se carga por
  // separado y sus citas aparecen en cuanto llegan (el principal primero),
  // sin esperar al más lento. La función de cada uno se crea una sola vez.
  const sourceFnsRef = useRef(new Map());
  const getSourceFn = useCallback(
    (calId) => {
      let fn = sourceFnsRef.current.get(calId);
      if (fn) return fn;

      fn = async (info, successCallback) => {
        try {
          // Vista mes: se piden SOLO los días del mes en curso (del 1 al último),
          // no las 6 semanas completas de la cuadrícula.
          let from = info.start;
          let to = info.end;
          if (calRef.current?.getApi().view?.type === "dayGridMonth") {
            // la cuadrícula empieza ≤ 6 días antes del día 1: +20 días cae dentro del mes
            const mid = new Date(info.start.getFullYear(), info.start.getMonth(), info.start.getDate() + 20);
            from = new Date(mid.getFullYear(), mid.getMonth(), 1);
            to = new Date(mid.getFullYear(), mid.getMonth() + 1, 1);
          }

          const { events: data, failed } = await requestRange(from, to, calId);
          markFailed(calId, failed > 0);

          // Mismo look que Outlook: relleno pastel con el color de la categoría
          // (o del calendario) y texto oscuro.
          successCallback(
            data.map((ev) => {
              const cid = ev?.extendedProps?.calendarId || calId;
              const base = ev?.extendedProps?.color || colorRef.current.get(cid) || PALETTE[0];
              const bg = pastel(base) || base;
              return {
                ...ev,
                backgroundColor: bg,
                borderColor: bg,
                textColor: "#1f2937",
                extendedProps: { ...ev.extendedProps, baseColor: base },
              };
            })
          );
        } catch (err) {
          console.error(`Calendario ${calId}:`, err);
          markFailed(calId, true);
          successCallback([]); // no romper a los demás calendarios
        }
      };

      sourceFnsRef.current.set(calId, fn);
      return fn;
    },
    [requestRange, markFailed]
  );

  // Solo hay fuentes cuando Outlook está conectado y ya se conoce la lista
  // de calendarios; al cambiar la selección, FullCalendar agrega o quita fuentes
  // (solo se pide lo nuevo).
  const eventSources = useMemo(
    () =>
      connected === true && ready
        ? selectedIdsArray.map((id) => ({ id, events: getSourceFn(id) }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connected, ready, selKey, getSourceFn]
  );

  const failedMsg =
    failedIds.size > 0
      ? `Outlook limitó las consultas: no se pudieron leer ${failedIds.size} calendario${
          failedIds.size > 1 ? "s" : ""
        }. Se muestran los demás.`
      : "";

  // Nuevo evento: formulario completo (como Outlook), prellenado con la
  // fecha/hora seleccionada en el calendario.
  const [newEv, setNewEv] = useState({ open: false, initial: null });

  const openNewEvent = (initial = null) => {
    if (connected !== true) {
      alert("Conecta Outlook para crear citas.");
      return;
    }
    setNewEv({ open: true, initial });
  };

  const handleSelect = (sel) => {
    openNewEvent({ start: sel.start, end: sel.end, allDay: sel.allDay });
    calRef.current?.getApi().unselect();
  };

  // Solo calendarios donde se puede escribir (el principal siempre)
  const writableCalendars = useMemo(
    () => [
      { id: PRIMARY_ID, name: primaryInfo.name || "Principal", color: colorById.get(PRIMARY_ID) },
      ...calendars
        .filter((c) => c.canEdit)
        .map((c) => ({ id: c.id, name: c.name, color: colorById.get(c.id) })),
    ],
    [calendars, primaryInfo, colorById]
  );

  function toggleCalendar(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    const next = new Set([PRIMARY_ID]);
    for (const c of calendars) next.add(c.id);
    setSelectedIds(next);
  }

  function onlyPrimary() {
    setSelectedIds(new Set([PRIMARY_ID]));
  }

  // Modal click
  function onEventClick(info) {
    // ✅ evita navegación / comportamientos raros del DOM
    if (info?.jsEvent) {
      info.jsEvent.preventDefault();
      info.jsEvent.stopPropagation();
    }

    const ev = info.event;
    const p = ev.extendedProps || {};

    setModal({
      open: true,
      event: {
        id: ev.id,
        title: ev.title,
        start: ev.start,
        end: ev.end,
        allDay: ev.allDay,
        calendarId: p.calendarId || "primary",
        eventId: p.eventId || "",
        location: p.location || "",
        organizer: p.organizer || "",
        attendees: Array.isArray(p.attendees) ? p.attendees : [],
        categories: Array.isArray(p.categories) ? p.categories : [],
        preview: p.preview || "",
        webLink: p.webLink || "",
      },
    });
  }

  const modalEv = modal.event;
  const modalCalName = modalEv ? calendarNameById.get(modalEv.calendarId) || modalEv.calendarId : "";
  const closeModal = () => {
    if (deleting) return;
    setModal({ open: false, event: null });
    setConfirmDel(false);
    setDelError("");
  };

  // Eliminar la cita (el servidor valida de nuevo que sea ADMIN o RECEPCION)
  const deleteEvent = async () => {
    if (!modalEv?.eventId || deleting) return;
    setDeleting(true);
    setDelError("");
    try {
      const resp = await fetch(`${CAL_API}/calendar/events`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getJwt()}` },
        credentials: "include",
        body: JSON.stringify({ calendarId: modalEv.calendarId, eventId: modalEv.eventId }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.mensaje || `Error ${resp.status}`);
      }
      cacheRef.current.clear();
      setModal({ open: false, event: null });
      setConfirmDel(false);
      calRef.current?.getApi().refetchEvents();
    } catch (e) {
      setDelError(String(e?.message || "No se pudo eliminar la cita."));
    } finally {
      setDeleting(false);
    }
  };

  const allCalendars = [{ id: PRIMARY_ID, name: primaryInfo.name || "Principal" }, ...calendars];

  // Cita en vista mes/lista: "10 AM  NOMBRE" (como Outlook, sin punto de color)
  const renderEvent = (arg) => {
    const { event, view } = arg;
    if (view.type !== "dayGridMonth") return undefined; // vistas semana/día: default
    const t = event.allDay ? "" : fmtOutlookTime(event.start);
    return (
      <div className="cal-ev" title={event.title}>
        {t ? <span className="cal-ev__time">{t}</span> : null}
        <span className="cal-ev__title">{event.title}</span>
      </div>
    );
  };

  return (
    <div className="cal-page">
      {/* ---------- Encabezado ---------- */}
      <header className="cal-header">
        <div className="cal-header__icon" aria-hidden="true">
          <CalendarMonthRoundedIcon />
        </div>
        <div>
          <h2 className="cal-header__title">Calendario</h2>
          <p className="cal-header__sub">Citas y eventos de la notaría, sincronizados con Outlook</p>
        </div>
        <div className="cal-header__spacer" />
        <span
          className={`cal-status ${connected === true ? "cal-status--ok" : connected === false ? "cal-status--off" : ""}`}
          title={statusMsg}
        >
          <i />
          {connected === true
            ? `Conectado a Outlook${account ? `: ${account}` : ""}`
            : connected === false
            ? "Outlook desconectado"
            : "Verificando conexión…"}
        </span>
        {connected === true ? (
          <button
            type="button"
            className="cal-btn"
            onClick={syncNow}
            disabled={syncing}
            title="Trae de Outlook solo lo que cambió"
          >
            <RefreshRoundedIcon className={syncing ? "cal-spin" : ""} />
            {syncing ? "Actualizando…" : syncAgo ? `Actualizar · ${syncAgo}` : "Actualizar"}
          </button>
        ) : null}
        <button
          type="button"
          className="cal-btn cal-btn--primary"
          onClick={() => openNewEvent(null)}
        >
          <AddRoundedIcon />
          Nuevo evento
        </button>
        <button
          type="button"
          className="cal-btn"
          onClick={() => window.open("https://outlook.live.com/calendar/", "_blank")}
        >
          <OpenInNewRoundedIcon />
          Abrir en Outlook
        </button>
      </header>

      {/* ---------- Aviso de conexión ---------- */}
      {connected === false && (
        <div className="cal-alert" role="status">
          <div className="cal-alert__icon" aria-hidden="true">
            <LinkOffRoundedIcon />
          </div>
          <div className="cal-alert__text">
            <div className="cal-alert__title">Outlook no está conectado</div>
            <div className="cal-alert__desc">
              {canConnect
                ? "Conecta la cuenta de Outlook de la notaría para ver y crear citas aquí."
                : "Pide a un administrador que conecte la cuenta de Outlook de la notaría."}
              {statusMsg ? ` (${statusMsg})` : ""}
            </div>
          </div>
          {canConnect ? (
            <button type="button" className="cal-btn cal-btn--primary" onClick={connectOutlook}>
              <LinkRoundedIcon />
              Conectar Outlook
            </button>
          ) : null}
        </div>
      )}

      {connected !== false && failedMsg && (
        <div className="cal-alert" role="alert">
          <div className="cal-alert__icon" aria-hidden="true">
            <LinkOffRoundedIcon />
          </div>
          <div className="cal-alert__text">
            <div className="cal-alert__title">Error al leer Outlook</div>
            <div className="cal-alert__desc">{failedMsg}</div>
          </div>
          <button
            type="button"
            className="cal-btn"
            onClick={() => calRef.current?.getApi().refetchEvents()}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ---------- Calendarios (chips con color) ---------- */}
      <section className="cal-panel" aria-label="Calendarios">
        <div className="cal-panel__label">
          Calendarios
          {loadingCals || loadingEv ? <span className="cal-loading">Cargando…</span> : null}
        </div>

        <div className="cal-panel__chips" role="group" aria-label="Filtrar calendarios">
          {allCalendars.map((c) => {
            const on = selectedIds.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`cal-chip${on ? " cal-chip--on" : ""}`}
                style={{ "--chip": colorFor(c.id) }}
                onClick={() => toggleCalendar(c.id)}
              >
                <span className="cal-chip__dot" />
                {c.name}
              </button>
            );
          })}
        </div>

        <div className="cal-panel__actions">
          <button type="button" className="cal-btn cal-btn--ghost" onClick={selectAll}>
            Todos
          </button>
          <button type="button" className="cal-btn cal-btn--ghost" onClick={onlyPrimary}>
            Solo principal
          </button>
        </div>
      </section>

      {/* ---------- Calendario ---------- */}
      <div className="cal-board">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={esLocale}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          buttonText={{ today: "Hoy", month: "Mes", week: "Semana", day: "Día" }}
          selectable
          selectMirror
          navLinks
          nowIndicator
          height="auto"
          showNonCurrentDates={false}
          fixedWeekCount={false}
          dayMaxEvents={false}
          loading={setLoadingEv}
          eventDisplay="block"
          weekNumbers
          weekText=""
          eventOrder="allDay,start,-duration,title"
          eventContent={renderEvent}
          moreLinkText={(n) => `+${n}`}
          allDayText="Todo el día"
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          scrollTime="08:00:00"
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false, meridiem: false }}
          select={handleSelect}
          eventSources={eventSources}
          eventClick={onEventClick}
        />
      </div>

      {/* ---------- Nuevo evento ---------- */}
      <NuevoEventoModal
        open={newEv.open}
        initial={newEv.initial}
        calendars={writableCalendars}
        apiBase={CAL_API}
        getJwt={getJwt}
        account={account}
        onClose={() => setNewEv({ open: false, initial: null })}
        onCreated={() => {
          cacheRef.current.clear(); // la cita nueva debe verse de inmediato
          calRef.current?.getApi().refetchEvents();
        }}
      />

      {/* ---------- Detalle del evento ---------- */}
      {modal.open && modalEv && (
        <div className="cal-overlay" onClick={closeModal}>
          <div
            className="cal-modal"
            role="dialog"
            aria-modal="true"
            aria-label={modalEv.title}
            style={{ "--ev": colorFor(modalEv.calendarId) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cal-modal__head">
              <span className="cal-modal__tag">
                <i />
                {modalCalName}
              </span>
              <h3 className="cal-modal__title">{modalEv.title || "(Sin título)"}</h3>
              <button type="button" className="cal-modal__close" onClick={closeModal} aria-label="Cerrar">
                <CloseRoundedIcon />
              </button>
            </div>

            <div className="cal-modal__body">
              <div className="cal-row">
                <div className="cal-row__icon"><AccessTimeRoundedIcon /></div>
                <div>
                  <div className="cal-row__label">Fecha y hora</div>
                  <div className="cal-row__value">
                    {fmtRange(modalEv.start, modalEv.end, modalEv.allDay) || fmt(modalEv.start)}
                  </div>
                </div>
              </div>

              {modalEv.location ? (
                <div className="cal-row">
                  <div className="cal-row__icon"><PlaceOutlinedIcon /></div>
                  <div>
                    <div className="cal-row__label">Lugar</div>
                    <div className="cal-row__value">{modalEv.location}</div>
                  </div>
                </div>
              ) : null}

              {modalEv.organizer ? (
                <div className="cal-row">
                  <div className="cal-row__icon"><PersonOutlineRoundedIcon /></div>
                  <div>
                    <div className="cal-row__label">Organiza</div>
                    <div className="cal-row__value">{modalEv.organizer}</div>
                  </div>
                </div>
              ) : null}

              {modalEv.attendees?.length ? (
                <div className="cal-row">
                  <div className="cal-row__icon"><GroupOutlinedIcon /></div>
                  <div>
                    <div className="cal-row__label">Asistentes ({modalEv.attendees.length})</div>
                    <div className="cal-tags">
                      {modalEv.attendees.map((a, i) => (
                        <span className="cal-tag" key={`${a}-${i}`}>{a}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {modalEv.categories?.length ? (
                <div className="cal-row">
                  <div className="cal-row__icon"><LabelOutlinedIcon /></div>
                  <div>
                    <div className="cal-row__label">Categorías</div>
                    <div className="cal-tags">
                      {modalEv.categories.map((c, i) => (
                        <span className="cal-tag" key={`${c}-${i}`}>{c}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="cal-row">
                <div className="cal-row__icon"><NotesRoundedIcon /></div>
                <div>
                  <div className="cal-row__label">Descripción</div>
                  {modalEv.preview ? (
                    <div className="cal-row__value cal-row__value--text">{modalEv.preview}</div>
                  ) : (
                    <div className="cal-row__value cal-row__value--muted">Sin descripción.</div>
                  )}
                </div>
              </div>
            </div>

            {confirmDel ? (
              <div className="cal-confirm" role="alertdialog" aria-label="Confirmar eliminación">
                <div className="cal-confirm__text">
                  <strong>¿Eliminar esta cita?</strong>
                  <span>
                    Se borrará también en Outlook y no se puede deshacer.
                    {modalEv.attendees?.length
                      ? " Como tiene invitados, Outlook les enviará la cancelación."
                      : ""}
                  </span>
                  {delError ? <span className="cal-confirm__err">{delError}</span> : null}
                </div>
                <div className="cal-confirm__btns">
                  <button
                    type="button"
                    className="cal-btn"
                    onClick={() => {
                      setConfirmDel(false);
                      setDelError("");
                    }}
                    disabled={deleting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="cal-btn cal-btn--danger"
                    onClick={deleteEvent}
                    disabled={deleting}
                    autoFocus
                  >
                    <DeleteOutlineRoundedIcon />
                    {deleting ? "Eliminando…" : "Sí, eliminar"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="cal-modal__foot">
              {canDelete && modalEv.eventId && !confirmDel ? (
                <button
                  type="button"
                  className="cal-btn cal-btn--danger-ghost"
                  onClick={() => setConfirmDel(true)}
                  style={{ marginRight: "auto" }}
                >
                  <DeleteOutlineRoundedIcon />
                  Eliminar cita
                </button>
              ) : null}
              {modalEv.webLink ? (
                <button type="button" className="cal-btn" onClick={() => window.open(modalEv.webLink, "_blank")}>
                  <OpenInNewRoundedIcon />
                  Abrir en Outlook
                </button>
              ) : null}
              <button type="button" className="cal-btn cal-btn--primary" onClick={closeModal}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
