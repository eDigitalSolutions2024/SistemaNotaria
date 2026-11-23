// Backend/routes/calendar.js
// Calendario de la notaría sincronizado con Outlook.
//
// La conexión con Outlook es UNA SOLA y compartida (la cuenta de la notaría);
// la conecta un ADMIN. Las citas se guardan en MongoDB y se mantienen al día
// con sincronización incremental (services/outlookService.js), así que las
// pantallas leen de la base de datos y cargan al instante.
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const router = express.Router();

const auth = require("../middleware/auth");
const Abogado = require("../models/Abogado");
const OutlookEvento = require("../models/OutlookEvento");
const OutlookSync = require("../models/OutlookSync");
const { getAuthUrl } = require("../utils/microsoftAuth");
const { registrar } = require("../utils/bitacora");
const { graphLimited } = require("../utils/graphGate");
const svc = require("../services/outlookService");

const GRAPH = "https://graph.microsoft.com/v1.0";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHOW_AS = ["free", "tentative", "busy", "oof", "workingElsewhere"];

// ¿El usuario es ADMIN? Se acepta el rol del token (en mayúsculas o minúsculas,
// como en abogado.js / bitacora.js) y, si el token es viejo o no lo trae, se
// confirma contra la base de datos.
// Rol del usuario: primero el del token (mayúsculas o minúsculas, como en
// abogado.js / bitacora.js) y, si el token es viejo o no lo trae, la base de datos.
async function userRole(req) {
  const tokenRole = String(req.user?.role || req.user?.rol || "").toUpperCase();
  if (tokenRole) return tokenRole;
  const id = Number(req.user?.id);
  if (!Number.isFinite(id)) return "";
  try {
    const a = await Abogado.findById(id).select("role").lean();
    return String(a?.role || "").toUpperCase();
  } catch {
    return "";
  }
}

async function isAdmin(req) {
  return (await userRole(req)) === "ADMIN";
}

// Borrar citas: SOLO administrador y recepción (evita que otros usuarios
// borren por accidente la información de alguien más).
const ROLES_PUEDEN_BORRAR = ["ADMIN", "RECEPCION"];
async function canDeleteEvents(req) {
  return ROLES_PUEDEN_BORRAR.includes(await userRole(req));
}

function notConnected(res) {
  return res.status(401).json({
    mensaje: "Outlook no conectado. Un administrador debe conectarlo.",
  });
}

/**
 * GET /api/calendar/status
 * Estado de la conexión compartida (no consulta a Microsoft: es instantáneo).
 */
router.get("/status", auth, async (req, res) => {
  try {
    const [canConnect, canDelete] = await Promise.all([isAdmin(req), canDeleteEvents(req)]);
    const conn = await svc.getConexion();
    if (!conn || !conn.refreshTokenEnc) {
      return res.json({ connected: false, canConnect, canDelete });
    }
    const last = await OutlookSync.findOne({ lastSync: { $ne: null } })
      .sort({ lastSync: -1 })
      .select("lastSync")
      .lean();
    res.json({
      connected: !conn.ultimoError,
      account: conn.account || "",
      lastSync: last?.lastSync || null,
      error: conn.ultimoError || "",
      canConnect,
      canDelete,
    });
  } catch (e) {
    console.error("CALENDAR STATUS ERROR:", e.message);
    res.status(500).json({ mensaje: "Error al leer el estado de Outlook" });
  }
});

/**
 * POST /api/calendar/connect-url   (solo ADMIN)
 * Devuelve la URL de Microsoft para conectar la cuenta de la notaría. Lleva un
 * "state" firmado para que solo un administrador autenticado pueda completar
 * la conexión.
 */
router.post("/connect-url", auth, async (req, res) => {
  if (!(await isAdmin(req))) {
    return res.status(403).json({ mensaje: "Solo un administrador puede conectar Outlook" });
  }
  const state = jwt.sign(
    { purpose: "ms-connect", id: req.user.id, nombre: req.user.nombre },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "10m" }
  );
  res.json({ url: getAuthUrl(state) });
});

/**
 * POST /api/calendar/disconnect   (solo ADMIN)
 */
router.post("/disconnect", auth, async (req, res) => {
  if (!(await isAdmin(req))) {
    return res.status(403).json({ mensaje: "Solo un administrador puede desconectar Outlook" });
  }
  await svc.disconnect();
  res.json({ ok: true });
});

/**
 * POST /api/calendar/sync
 * "Actualizar ahora": trae de Outlook solo lo que cambió.
 */
let lastManualSync = 0;
router.post("/sync", auth, async (req, res) => {
  try {
    const conn = await svc.getConexion();
    if (!conn || !conn.refreshTokenEnc) return notConnected(res);

    // Evita que varios usuarios disparen sincronizaciones una tras otra
    if (Date.now() - lastManualSync < 15_000) {
      return res.json({ ok: true, skipped: true });
    }
    lastManualSync = Date.now();

    const r = await svc.syncAll();
    res.json({ ok: r.ok, failed: r.failed, total: r.total });
  } catch (e) {
    console.error("CALENDAR SYNC ERROR:", e.response?.data || e.message);
    res.status(e.response?.status || 500).json({ mensaje: "No se pudo actualizar desde Outlook" });
  }
});

/**
 * GET /api/calendar/calendars
 */
router.get("/calendars", auth, async (req, res) => {
  try {
    let conn = await svc.getConexion();
    if (!conn || !conn.refreshTokenEnc) return notConnected(res);
    if (!conn.calendarios?.length) conn = (await svc.refreshMeta()) || conn;

    const list = conn.calendarios || [];
    const def = list.find((c) => c.isDefault);
    res.json({
      primary: def ? { name: def.name, color: def.color } : null,
      calendars: list
        .filter((c) => !c.isDefault)
        .map((c) => ({
          id: c.id,
          name: c.name,
          canEdit: c.canEdit,
          owner: c.owner,
          color: c.color,
        })),
    });
  } catch (e) {
    console.error("CALENDARS ERROR:", e.response?.data || e.message);
    res.status(e.response?.status || 500).json({
      mensaje: "Error al listar calendarios",
      detalle: e.response?.data || e.message,
    });
  }
});

/**
 * GET /api/calendar/categories
 */
router.get("/categories", auth, async (req, res) => {
  try {
    const conn = await svc.getConexion();
    res.json((conn?.categorias || []).map((c) => ({ name: c.name, color: c.color })));
  } catch {
    res.json([]);
  }
});

/**
 * GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&calendarIds=a,b
 * Lee de la base de datos (instantáneo). `to` es exclusivo.
 * Si un calendario nunca se ha sincronizado, se sincroniza en este momento.
 */
router.get("/events", auth, async (req, res) => {
  try {
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return res.status(400).json({ mensaje: "from y to (YYYY-MM-DD) son requeridos" });
    }

    let conn = await svc.getConexion();
    if (!conn || !conn.refreshTokenEnc) return notConnected(res);
    if (conn.ultimoError) return res.status(401).json({ mensaje: conn.ultimoError });
    if (!conn.calendarios?.length) conn = (await svc.refreshMeta()) || conn;

    const ids = Array.from(
      new Set(
        String(req.query.calendarIds || "primary")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );

    // Calendarios que aún no se han sincronizado: se hace ahora (una sola vez)
    const synced = await OutlookSync.find({ calendarId: { $in: ids }, deltaLink: { $ne: "" } })
      .select("calendarId lastSync")
      .lean();
    const have = new Set(synced.map((s) => s.calendarId));
    const missing = ids.filter((id) => !have.has(id));
    let failed = 0;
    await Promise.all(
      missing.map(async (id) => {
        try {
          await svc.syncCalendar(id);
        } catch (e) {
          failed++;
          console.error(
            "SYNC inicial falló:",
            id,
            e.response?.status || "",
            e.response?.data?.error?.code || e.message
          );
        }
      })
    );

    const docs = await OutlookEvento.find({
      calendarId: { $in: ids },
      start: { $lt: `${to}T00:00:00` },
      end: { $gt: `${from}T00:00:00` },
    })
      .sort({ start: 1 })
      .lean();

    const calColor = new Map((conn.calendarios || []).map((c) => [c.id, c.color]));
    const catColor = new Map((conn.categorias || []).map((c) => [c.name, c.color]));

    const events = docs.map((d) => {
      let color = null;
      for (const c of d.categories || []) {
        if (catColor.get(c)) {
          color = catColor.get(c);
          break;
        }
      }
      return {
        id: `${d.calendarId}:${d.eventId}`,
        title: d.subject || "(Sin título)",
        start: d.start,
        end: d.end,
        allDay: !!d.isAllDay,
        extendedProps: {
          calendarId: d.calendarId,
          eventId: d.eventId,
          color: color || calColor.get(d.calendarId) || null,
          location: d.location || "",
          preview: d.preview || "",
          organizer: d.organizer || "",
          attendees: d.attendees || [],
          categories: d.categories || [],
          webLink: d.webLink || "",
        },
      };
    });

    const last = synced.reduce(
      (m, s) => (s.lastSync && (!m || s.lastSync > m) ? s.lastSync : m),
      null
    );

    res.json({ events, failed, total: ids.length, lastSync: last });
  } catch (err) {
    const status = err.response?.status || 500;
    console.error("CALENDAR GET ERROR:", status, err.response?.data || err.message);
    res.status(status === 401 ? 401 : status).json({
      mensaje: "Error al obtener eventos de Outlook",
      detalle: err.response?.data || err.message,
    });
  }
});

/**
 * POST /api/calendar/events
 * Crea una cita en Outlook y la refleja de inmediato en la copia local.
 */
router.post("/events", auth, async (req, res) => {
  try {
    const b = req.body || {};
    const subject = String(b.subject || "").trim();
    const start = String(b.start || "").trim();
    const end = String(b.end || "").trim();

    if (!subject || !start || !end) {
      return res.status(400).json({ mensaje: "subject, start y end requeridos" });
    }
    if (new Date(end) < new Date(start)) {
      return res.status(400).json({ mensaje: "La hora final es anterior al inicio" });
    }

    const conn = await svc.getConexion();
    const accessToken = await svc.getAccessToken();
    if (!conn || !accessToken) return notConnected(res);

    // Las horas llegan como "de reloj" (sin zona): se envían en la zona de Outlook
    const tz = /Z$|[+-]\d{2}:\d{2}$/.test(start) ? "UTC" : svc.OUTLOOK_TZ;
    const tzEnd = /Z$|[+-]\d{2}:\d{2}$/.test(end) ? "UTC" : svc.OUTLOOK_TZ;

    const payload = {
      subject: subject.slice(0, 255),
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: end, timeZone: tzEnd },
    };
    if (b.isAllDay) payload.isAllDay = true;

    const body = String(b.body || "").trim();
    if (body) payload.body = { contentType: "text", content: body.slice(0, 20000) };

    const location = String(b.location || "").trim();
    if (location) payload.location = { displayName: location.slice(0, 255) };

    const attendees = (Array.isArray(b.attendees) ? b.attendees : [])
      .map((a) => String(a || "").trim())
      .filter((a) => EMAIL_RE.test(a))
      .slice(0, 100);
    if (attendees.length) {
      payload.attendees = attendees.map((address) => ({
        type: "required",
        emailAddress: { address },
      }));
    }

    if (SHOW_AS.includes(b.showAs)) payload.showAs = b.showAs;

    const rem = Number(b.reminderMinutes);
    if (b.reminderMinutes === null || b.reminderMinutes === "none") {
      payload.isReminderOn = false;
    } else if (Number.isFinite(rem) && rem >= 0) {
      payload.isReminderOn = true;
      payload.reminderMinutesBeforeStart = Math.min(Math.round(rem), 40320);
    }

    const categories = (Array.isArray(b.categories) ? b.categories : [])
      .map((c) => String(c || "").trim())
      .filter(Boolean)
      .slice(0, 25);
    if (categories.length) payload.categories = categories;

    if (b.isPrivate) payload.sensitivity = "private";

    if (b.isOnlineMeeting) {
      payload.isOnlineMeeting = true;
      // Cuentas personales (hotmail/outlook/live) usan Teams para consumidores.
      const personal = /@(hotmail|outlook|live|msn)\./i.test(String(conn.account || ""));
      payload.onlineMeetingProvider = personal ? "teamsForConsumer" : "teamsForBusiness";
    }

    // Calendario destino: "primary"/vacío = el predeterminado
    const calId = String(b.calendarId || "").trim() || "primary";
    const target = (conn.calendarios || []).find((c) => c.id === calId);
    const url =
      calId === "primary"
        ? `${GRAPH}/me/events`
        : `${GRAPH}/me/calendars/${encodeURIComponent(target?.graphId || calId)}/events`;

    const graphResp = await graphLimited(() =>
      axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
    );

    // La cita nueva debe verse de inmediato: se trae el cambio de ese calendario
    await svc.syncCalendar(calId).catch((e) =>
      console.error("SYNC tras crear falló:", e.response?.data?.error?.code || e.message)
    );

    res.status(201).json({ id: graphResp.data?.id, ok: true });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || null;
    console.error("CALENDAR POST ERROR:", status, data || err.message);
    res.status(status).json({
      mensaje: "Error al crear evento en Outlook",
      detalle: data || err.message,
    });
  }
});

/**
 * DELETE /api/calendar/events
 * Body: { calendarId, eventId }
 * Solo ADMIN y RECEPCION. Borra la cita en Outlook (si tiene invitados,
 * Outlook les envía la cancelación) y de la copia local. Queda en bitácora.
 */
router.delete("/events", auth, async (req, res) => {
  try {
    if (!(await canDeleteEvents(req))) {
      return res.status(403).json({
        mensaje: "Solo administración y recepción pueden eliminar citas",
      });
    }

    const calId = String(req.body?.calendarId || "").trim() || "primary";
    const eventId = String(req.body?.eventId || "").trim();
    if (!eventId) return res.status(400).json({ mensaje: "eventId requerido" });

    const conn = await svc.getConexion();
    const accessToken = await svc.getAccessToken();
    if (!conn || !accessToken) return notConnected(res);

    const cal = (conn.calendarios || []).find((c) => c.id === calId);
    if (calId !== "primary" && !cal) {
      return res.status(404).json({ mensaje: "Calendario no encontrado" });
    }
    if (cal && !cal.canEdit) {
      return res.status(403).json({
        mensaje: `No hay permiso de edición en el calendario "${cal.name}"`,
      });
    }

    // Datos para la bitácora (antes de borrar)
    const doc = await OutlookEvento.findOne({ calendarId: calId, eventId }).lean();

    const url =
      calId === "primary"
        ? `${GRAPH}/me/events/${encodeURIComponent(eventId)}`
        : `${GRAPH}/me/calendars/${encodeURIComponent(cal.graphId || calId)}/events/${encodeURIComponent(eventId)}`;

    try {
      await graphLimited(() =>
        axios.delete(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      );
    } catch (e) {
      // Si ya no existe en Outlook (alguien lo borró allá), basta con limpiar la copia local
      if (e.response?.status !== 404) throw e;
    }

    await OutlookEvento.deleteOne({ calendarId: calId, eventId });

    await registrar(req, {
      accion: "CITA_ELIMINADA",
      entidad: "CalendarioOutlook",
      entidadId: eventId,
      detalle: `Eliminó la cita "${doc?.subject || "(sin título)"}" (${doc?.start || "?"}) del calendario "${
        cal?.name || "principal"
      }"`,
    });

    // Confirma con Outlook en segundo plano (no hace esperar al usuario)
    svc.syncCalendar(calId).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    const status = err.response?.status || 500;
    console.error("CALENDAR DELETE ERROR:", status, err.response?.data || err.message);
    res.status(status).json({
      mensaje:
        status === 403
          ? "Outlook no permite eliminar esta cita (no tienes permiso sobre ella)"
          : "Error al eliminar la cita en Outlook",
      detalle: err.response?.data || err.message,
    });
  }
});

module.exports = router;
