import React, { useEffect, useMemo, useRef, useState } from "react";

import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SHOW_AS = [
  { v: "busy", t: "Ocupada" },
  { v: "free", t: "Libre" },
  { v: "tentative", t: "Provisional" },
  { v: "oof", t: "Fuera de la oficina" },
  { v: "workingElsewhere", t: "Trabajando en otro lugar" },
];

const REMINDERS = [
  { v: "none", t: "Sin recordatorio" },
  { v: "0", t: "Al inicio" },
  { v: "5", t: "5 minutos antes" },
  { v: "15", t: "15 minutos antes" },
  { v: "30", t: "30 minutos antes" },
  { v: "60", t: "1 hora antes" },
  { v: "1440", t: "1 día antes" },
];

const pad = (n) => String(n).padStart(2, "0");
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Suma minutos a (fecha "YYYY-MM-DD", hora "HH:mm") y devuelve [fecha, hora]
function addMinutes(dateStr, timeStr, mins) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + mins);
  return [toDateStr(dt), toTimeStr(dt)];
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

// Valores iniciales: a partir de lo que se seleccionó en el calendario (o ahora)
function buildInitial(initial) {
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  const s = initial?.start ? new Date(initial.start) : now;
  const allDay = !!initial?.allDay;

  if (allDay) {
    const sd = toDateStr(s);
    // FullCalendar entrega el fin de eventos de día completo como exclusivo
    const e = initial?.end ? new Date(new Date(initial.end).getTime() - 24 * 3600 * 1000) : s;
    const ed = toDateStr(e) < sd ? sd : toDateStr(e);
    return { allDay: true, startDate: sd, startTime: "09:00", endDate: ed, endTime: "09:30" };
  }

  // Un clic en la vista mes llega sin hora: se propone 9:00 – 9:30
  const hasTime = initial?.start && !(s.getHours() === 0 && s.getMinutes() === 0);
  const sd = toDateStr(s);
  const st = hasTime || !initial?.start ? toTimeStr(s) : "09:00";
  let [ed, et] = addMinutes(sd, st, 30);
  if (initial?.end && hasTime) {
    const e = new Date(initial.end);
    ed = toDateStr(e);
    et = toTimeStr(e);
  }
  return { allDay: false, startDate: sd, startTime: st, endDate: ed, endTime: et };
}

export default function NuevoEventoModal({
  open,
  onClose,
  onCreated,
  initial,
  calendars, // [{ id, name, color }] solo los editables
  apiBase,
  getJwt,
  account,
}) {
  const titleRef = useRef(null);

  const [form, setForm] = useState(null);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reinicia el formulario cada vez que se abre
  useEffect(() => {
    if (!open) return;
    const d = buildInitial(initial);
    setForm({
      calendarId: calendars[0]?.id || "primary",
      subject: "",
      attendees: [],
      ...d,
      location: "",
      teams: false,
      body: "",
      showAs: "busy",
      reminder: "15",
      cats: [],
      isPrivate: false,
    });
    setAttendeeInput("");
    setError("");
    setSaving(false);
    setTimeout(() => titleRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Categorías de Outlook (opcional)
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/calendar/categories`, {
          headers: { Authorization: `Bearer ${getJwt()}` },
          credentials: "include",
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancel && Array.isArray(data)) setCategories(data);
      } catch {
        /* sin categorías: el formulario sigue funcionando */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, apiBase, getJwt]);

  // Escape cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  const calColor = useMemo(
    () => calendars.find((c) => c.id === form?.calendarId)?.color || "#2563eb",
    [calendars, form?.calendarId]
  );

  if (!open || !form) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  function commitAttendees(raw) {
    const parts = String(raw)
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return true;
    const bad = parts.filter((p) => !EMAIL_RE.test(p));
    const good = parts.filter((p) => EMAIL_RE.test(p));
    setForm((f) => ({
      ...f,
      attendees: Array.from(new Set([...f.attendees, ...good.map((g) => g.toLowerCase())])),
    }));
    setAttendeeInput(bad.join(" "));
    if (bad.length) {
      setError(`Correo no válido: ${bad.join(", ")}`);
      return false;
    }
    setError("");
    return true;
  }

  function onStartChange(patch) {
    // Mantiene la duración al mover el inicio
    const next = { ...form, ...patch };
    if (!next.allDay) {
      const oldStart = new Date(`${form.startDate}T${form.startTime}:00`);
      const oldEnd = new Date(`${form.endDate}T${form.endTime}:00`);
      const dur = Math.max(5, Math.round((oldEnd - oldStart) / 60000)) || 30;
      const [ed, et] = addMinutes(next.startDate, next.startTime, dur);
      next.endDate = ed;
      next.endTime = et;
    } else if (next.endDate < next.startDate) {
      next.endDate = next.startDate;
    }
    setForm(next);
  }

  async function save(e) {
    e?.preventDefault();
    if (saving) return;

    // Si quedó un correo escrito sin confirmar, se agrega antes de guardar
    if (attendeeInput.trim() && !commitAttendees(attendeeInput)) return;

    const subject = form.subject.trim();
    if (!subject) {
      setError("Agrega un título.");
      titleRef.current?.focus();
      return;
    }

    let start;
    let end;
    if (form.allDay) {
      start = `${form.startDate}T00:00:00`;
      end = `${addDays(form.endDate, 1)}T00:00:00`;
    } else {
      start = `${form.startDate}T${form.startTime}:00`;
      end = `${form.endDate}T${form.endTime}:00`;
    }
    if (new Date(end) <= new Date(start)) {
      setError("La hora de fin debe ser posterior al inicio.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const resp = await fetch(`${apiBase}/calendar/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getJwt()}`,
        },
        credentials: "include",
        body: JSON.stringify({
          calendarId: form.calendarId,
          subject,
          start,
          end,
          isAllDay: form.allDay,
          attendees: form.attendees,
          location: form.location,
          body: form.body,
          showAs: form.showAs,
          reminderMinutes: form.reminder === "none" ? null : Number(form.reminder),
          categories: form.cats,
          isPrivate: form.isPrivate,
          isOnlineMeeting: form.teams,
          accountHint: account || "",
        }),
      });
      if (!resp.ok) {
        let msg = "";
        try {
          const j = await resp.json();
          msg =
            j?.detalle?.error?.message ||
            j?.detalle?.error_description ||
            j?.mensaje ||
            "";
        } catch {
          /* sin detalle */
        }
        throw new Error(msg || `Error ${resp.status}`);
      }
      onCreated?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError(`No se pudo crear la cita. ${String(err.message || "").slice(0, 250)}`);
      setSaving(false);
    }
  }

  return (
    <div className="cal-overlay" onMouseDown={() => !saving && onClose()}>
      <form
        className="cal-modal cal-form"
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo evento"
        style={{ "--ev": calColor }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={save}
      >
        <div className="cal-modal__head">
          <span className="cal-modal__tag">
            <i />
            Nuevo evento
          </span>
          <button type="button" className="cal-modal__close" onClick={onClose} disabled={saving} aria-label="Cerrar">
            <CloseRoundedIcon />
          </button>
        </div>

        <div className="cal-modal__body cal-form__body">
         <div className="cal-form__cols">
          <div className="cal-form__left">
          {/* Calendario */}
          <div className="cal-frow">
            <div className="cal-row__icon">
              <span className="cal-form__dot" style={{ background: calColor }} />
            </div>
            <div className="cal-form__field">
              <label className="cal-form__label" htmlFor="ne-cal">Calendario</label>
              <select
                id="ne-cal"
                className="cal-input"
                value={form.calendarId}
                onChange={(e) => set({ calendarId: e.target.value })}
              >
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Título */}
          <div className="cal-frow">
            <div className="cal-row__icon" />
            <div className="cal-form__field">
              <input
                ref={titleRef}
                className="cal-input cal-input--title"
                placeholder="Agregar título"
                value={form.subject}
                maxLength={255}
                onChange={(e) => set({ subject: e.target.value })}
              />
            </div>
          </div>

          {/* Asistentes */}
          <div className="cal-frow">
            <div className="cal-row__icon"><GroupOutlinedIcon /></div>
            <div className="cal-form__field">
              <label className="cal-form__label" htmlFor="ne-att">Asistentes</label>
              <div className="cal-chips-input">
                {form.attendees.map((a) => (
                  <span className="cal-tag cal-tag--x" key={a}>
                    {a}
                    <button
                      type="button"
                      aria-label={`Quitar ${a}`}
                      onClick={() => set({ attendees: form.attendees.filter((x) => x !== a) })}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="ne-att"
                  type="text"
                  inputMode="email"
                  placeholder={form.attendees.length ? "" : "Invita a los asistentes por correo"}
                  value={attendeeInput}
                  onChange={(e) => setAttendeeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === " ") {
                      if (attendeeInput.trim()) {
                        e.preventDefault();
                        commitAttendees(attendeeInput);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                      }
                    } else if (e.key === "Backspace" && !attendeeInput && form.attendees.length) {
                      set({ attendees: form.attendees.slice(0, -1) });
                    }
                  }}
                  onBlur={() => attendeeInput.trim() && commitAttendees(attendeeInput)}
                />
              </div>
            </div>
          </div>

          {/* Fecha y hora */}
          <div className="cal-frow">
            <div className="cal-row__icon"><AccessTimeRoundedIcon /></div>
            <div className="cal-form__field">
              <label className="cal-form__label">Fecha y hora</label>
              <div className="cal-form__dates">
                <input
                  type="date"
                  className="cal-input"
                  value={form.startDate}
                  onChange={(e) => e.target.value && onStartChange({ startDate: e.target.value })}
                />
                {!form.allDay && (
                  <input
                    type="time"
                    className="cal-input"
                    step={900}
                    value={form.startTime}
                    onChange={(e) => e.target.value && onStartChange({ startTime: e.target.value })}
                  />
                )}
                <span className="cal-form__to">a</span>
                {!form.allDay && (
                  <input
                    type="time"
                    className="cal-input"
                    step={900}
                    value={form.endTime}
                    onChange={(e) => e.target.value && set({ endTime: e.target.value })}
                  />
                )}
                <input
                  type="date"
                  className="cal-input"
                  min={form.startDate}
                  value={form.endDate}
                  onChange={(e) => e.target.value && set({ endDate: e.target.value })}
                />
              </div>
              <label className="cal-check">
                <input
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(e) => set({ allDay: e.target.checked })}
                />
                Todo el día
              </label>
            </div>
          </div>

          {/* Ubicación */}
          <div className="cal-frow">
            <div className="cal-row__icon"><PlaceOutlinedIcon /></div>
            <div className="cal-form__field">
              <label className="cal-form__label" htmlFor="ne-loc">Ubicación</label>
              <input
                id="ne-loc"
                className="cal-input"
                placeholder="Buscar una ubicación"
                value={form.location}
                maxLength={255}
                onChange={(e) => set({ location: e.target.value })}
              />
            </div>
          </div>

          {/* Teams */}
          <div className="cal-frow">
            <div className="cal-row__icon"><VideocamOutlinedIcon /></div>
            <div className="cal-form__field">
              <label className="cal-switch">
                <input
                  type="checkbox"
                  checked={form.teams}
                  onChange={(e) => set({ teams: e.target.checked })}
                />
                <span className="cal-switch__track"><i /></span>
                Reunión de Teams
              </label>
            </div>
          </div>

          {/* Disponibilidad, recordatorio, privado */}
          <div className="cal-frow">
            <div className="cal-row__icon"><NotificationsNoneRoundedIcon /></div>
            <div className="cal-form__field cal-form__grid">
              <div>
                <label className="cal-form__label" htmlFor="ne-show">Mostrar como</label>
                <select
                  id="ne-show"
                  className="cal-input"
                  value={form.showAs}
                  onChange={(e) => set({ showAs: e.target.value })}
                >
                  {SHOW_AS.map((o) => (
                    <option key={o.v} value={o.v}>{o.t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="cal-form__label" htmlFor="ne-rem">Recordatorio</label>
                <select
                  id="ne-rem"
                  className="cal-input"
                  value={form.reminder}
                  onChange={(e) => set({ reminder: e.target.value })}
                >
                  {REMINDERS.map((o) => (
                    <option key={o.v} value={o.v}>{o.t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Categorías */}
          {categories.length > 0 && (
            <div className="cal-frow">
              <div className="cal-row__icon"><LabelOutlinedIcon /></div>
              <div className="cal-form__field">
                <label className="cal-form__label">Categorías</label>
                <div className="cal-cats">
                  {categories.map((c) => {
                    const on = form.cats.includes(c.name);
                    return (
                      <button
                        type="button"
                        key={c.name}
                        className={`cal-cat${on ? " cal-cat--on" : ""}`}
                        style={{ "--cat": c.color || "#94a3b8" }}
                        aria-pressed={on}
                        onClick={() =>
                          set({
                            cats: on ? form.cats.filter((x) => x !== c.name) : [...form.cats, c.name],
                          })
                        }
                      >
                        <i />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="cal-frow">
            <div className="cal-row__icon"><LockOutlinedIcon /></div>
            <div className="cal-form__field">
              <label className="cal-check">
                <input
                  type="checkbox"
                  checked={form.isPrivate}
                  onChange={(e) => set({ isPrivate: e.target.checked })}
                />
                Privado (los demás solo verán que estás ocupado)
              </label>
            </div>
          </div>

          </div>

          {/* Descripción */}
          <div className="cal-form__right">
            <div className="cal-frow cal-frow--grow">
              <div className="cal-row__icon"><NotesRoundedIcon /></div>
              <div className="cal-form__field cal-form__field--grow">
                <label className="cal-form__label" htmlFor="ne-body">Descripción</label>
                <textarea
                  id="ne-body"
                  className="cal-input cal-input--area"
                  placeholder="Detalles de la cita (asunto, documentos, notas)"
                  value={form.body}
                  onChange={(e) => set({ body: e.target.value })}
                />
              </div>
            </div>
          </div>
         </div>

          {error ? (
            <div className="cal-form__error" role="alert">{error}</div>
          ) : null}
        </div>

        <div className="cal-modal__foot">
          <button type="button" className="cal-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="cal-btn cal-btn--primary" disabled={saving}>
            <SaveRoundedIcon />
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
