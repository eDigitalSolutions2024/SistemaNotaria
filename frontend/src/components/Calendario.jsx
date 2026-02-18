import React, { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

const CAL_API = "http://localhost:8020/api";
const PRIMARY_ID = "primary";

function fmt(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return String(dt);
  }
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
  const [selectedIds, setSelectedIds] = useState(new Set([PRIMARY_ID]));
  const [loadingCals, setLoadingCals] = useState(false);

  // Modal (click)
  const [modal, setModal] = useState({ open: false, event: null });

  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const calendarNameById = useMemo(() => {
    const m = new Map();
    m.set(PRIMARY_ID, "(Principal)");
    for (const c of calendars) m.set(c.id, c.name);
    return m;
  }, [calendars]);

 const [connected, setConnected] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${CAL_API}/calendar/status`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          credentials: "include",
        });

        if (!resp.ok) return;
        const data = await resp.json();
        setConnected(!!data?.connected);
      } catch (e) {
        console.error("status outlook error:", e);
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
        const list = Array.isArray(data) ? data : [];
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
      }
    })();
  }, [connected]);


  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api) api.refetchEvents();
  }, [selectedIdsArray.join(",")]);


  const fetchEvents = async (info, successCallback, failureCallback) => {
    if (connected !== true) return successCallback([]);
    try {
      const params = new URLSearchParams({
        start: info.startStr,
        end: info.endStr,
      });

      if (selectedIdsArray.length > 0) {
        params.set("calendarIds", selectedIdsArray.join(","));
      }

      const resp = await fetch(`${CAL_API}/calendar/events?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getJwt()}`,

        },
        credentials: "include",
      });

      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      successCallback(data || []);
    } catch (err) {
      console.error(err);
      failureCallback(err);
    }
  };

  const handleSelect = async (sel) => {
    const subject = prompt("Título de la cita:");
    if (!subject) return;

    try {
      const resp = await fetch(`${CAL_API}/calendar/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getJwt()}`,

        },
        credentials: "include",
        body: JSON.stringify({
          subject,
          start: sel.startStr,
          end: sel.endStr,
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());
      calRef.current?.getApi().refetchEvents();
    } catch (e) {
      console.error(e);
      alert("No se pudo crear la cita.");
    }
  };

  function refetch() {
  const api = calRef.current?.getApi();
  if (api) api.refetchEvents();
}

function toggleCalendar(id) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  // refetch después del state, pero sin timeout: hazlo en un useEffect
}


  function selectAll() {
    const next = new Set([PRIMARY_ID]);
    for (const c of calendars) next.add(c.id);
    setSelectedIds(next);
    //setTimeout(() => calRef.current?.getApi().refetchEvents(), 0);
  }

  function onlyPrimary() {
    setSelectedIds(new Set([PRIMARY_ID]));
    //setTimeout(() => calRef.current?.getApi().refetchEvents(), 0);
  }

  // Modal click
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
  const modalCalName = modalEv ? (calendarNameById.get(modalEv.calendarId) || modalEv.calendarId) : "";

  return (
    <div style={{ padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Calendario</h2>
        <button
          type="button"
          onClick={() => window.open("https://outlook.live.com/calendar/", "_blank")}
          style={{
            marginLeft: "auto",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            cursor: "pointer",
            background: "#fff",
          }}
        >
          Abrir en Outlook
        </button>
      </div>

      {/* Panel de selección */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 10,
          marginBottom: 10,
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <strong style={{ fontSize: 14 }}>Calendarios</strong>
          {loadingCals ? <span style={{ fontSize: 12, opacity: 0.7 }}>Cargando…</span> : null}

          <button
            type="button"
            onClick={selectAll}
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              cursor: "pointer",
              background: "#fff",
            }}
          >
            Seleccionar todos
          </button>

          <button
            type="button"
            onClick={onlyPrimary}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              cursor: "pointer",
              background: "#fff",
            }}
          >
            Solo principal
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={selectedIds.has(PRIMARY_ID)}
              onChange={() => toggleCalendar(PRIMARY_ID)}
            />
            (Principal)
          </label>

          {calendars.map((c) => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={selectedIds.has(c.id)}
                onChange={() => toggleCalendar(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      </div>

      {connected === false && (
        <div
          style={{
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            padding: 12,
            borderRadius: 10,
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13 }}>
            Necesitas conectar Outlook para ver tus eventos.
          </div>

          <button
            type="button"
            onClick={() => {
              localStorage.setItem("postLoginGoTo", "calendario");
              window.location.href = `${CAL_API.replace("/api", "")}/auth/microsoft/login`;
            }}
            style={{
              marginLeft: "auto",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              cursor: "pointer",
              background: "#fff",
            }}
          >
            Conectar Outlook
          </button>
        </div>
      )}


      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        height="auto"
        selectable
        select={handleSelect}
        events={fetchEvents}
        eventClick={onEventClick}
      />

      {/* Modal click */}
      {modal.open && modalEv && (
        <div
          onClick={() => setModal({ open: false, event: null })}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.35)",
            zIndex: 10000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 20px 50px rgba(0,0,0,.25)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb", display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{modalEv.title}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  <b>Calendario:</b> {modalCalName}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  <b>Inicio:</b> {fmt(modalEv.start)} &nbsp; | &nbsp; <b>Fin:</b> {fmt(modalEv.end)}
                </div>
                {modalEv.location ? (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    <b>Lugar:</b> {modalEv.location}
                  </div>
                ) : null}
                {modalEv.organizer ? (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    <b>Organiza:</b> {modalEv.organizer}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setModal({ open: false, event: null })}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                  height: 38,
                }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ padding: 14 }}>
              {modalEv.categories?.length ? (
                <div style={{ fontSize: 12, marginBottom: 10 }}>
                  <b>Categorías:</b> {modalEv.categories.join(", ")}
                </div>
              ) : null}

              {modalEv.attendees?.length ? (
                <div style={{ fontSize: 12, marginBottom: 10 }}>
                  <b>Asistentes:</b> {modalEv.attendees.join(", ")}
                </div>
              ) : null}

              {modalEv.preview ? (
                <div style={{ fontSize: 12, whiteSpace: "pre-wrap", opacity: 0.9 }}>
                  {modalEv.preview}
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.7 }}>Sin descripción.</div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                {modalEv.webLink ? (
                  <button
                    type="button"
                    onClick={() => window.open(modalEv.webLink, "_blank")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    Abrir en Outlook
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
