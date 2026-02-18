// Backend/routes/calendar.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

const auth = require("../middleware/auth");
const { refreshAccessToken } = require("../utils/microsoftAuth");

// Zona horaria default (tu timezone)
const DEFAULT_TZ = "America/Chihuahua";

// Helper: decide timezone a mandar a Graph
function pickTimeZone(iso) {
  const s = String(iso || "");
  // si viene con Z o con offset (+/-HH:mm), mejor tratarlo como UTC
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) return "UTC";
  return DEFAULT_TZ;
}

// Helper: asegura access token válido usando sesión
async function getMsAccessToken(req) {
  const ms = req.session?.ms || {};
  const now = Date.now();

  // si tenemos access token y aún no expira (con colchón 60s)
  if (ms.accessToken && ms.expiresAt && ms.expiresAt - 60_000 > now) {
    return ms.accessToken;
  }

  // si no hay refresh token, no hay forma
  if (!ms.refreshToken) return null;

  // refresca
  const refreshed = await refreshAccessToken(ms.refreshToken);

  // guarda de vuelta en sesión
  req.session.ms = {
    ...ms,
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
    refreshToken: refreshed.refreshToken || ms.refreshToken,
  };

  // importante: persistir en MongoStore
  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  return req.session.ms.accessToken;
}

/**
 * (Opcional) endpoint para que el front sepa si está conectado a Outlook
 */
router.get("/status", auth, (req, res) => {
  const ok = !!req.session?.ms?.refreshToken;
  res.json({ connected: ok });
});

/**
 * GET /api/calendar/events?start=...&end=...
 * Soporta:
 * - default: principal
 * - ?calendarId=<id> (uno)
 * - ?calendarIds=primary,<id1>,<id2> (varios)
 */
router.get("/events", auth, async (req, res) => {
  try {
    const start = String(req.query.start || "").trim();
    const end = String(req.query.end || "").trim();

    if (!start || !end) {
      return res.status(400).json({ mensaje: "start y end son requeridos" });
    }

    const accessToken = await getMsAccessToken(req);
    if (!accessToken) {
      return res.status(401).json({
        mensaje: "Outlook no conectado. Inicia en /auth/microsoft/login",
      });
    }

    // ✅ Soporta 1 o varios calendarios
    const calendarId = String(req.query.calendarId || "").trim();
    const calendarIdsParam = String(req.query.calendarIds || "").trim();
    const calendarIds = calendarIdsParam
      ? calendarIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // Helper: trae calendarView de un calendario específico o del principal (null)
    async function fetchCalendarViewFor(idOrNull) {
      const url = idOrNull
        ? `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(
            idOrNull
          )}/calendarView`
        : `https://graph.microsoft.com/v1.0/me/calendarView`;

      const r = await axios.get(url, {
        params: {
          startDateTime: start,
          endDateTime: end,
          $select:
            "id,subject,start,end,isAllDay,location,bodyPreview,organizer,attendees,categories,webLink",
          $top: 200,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: `outlook.timezone="${DEFAULT_TZ}"`,
        },
      });

      const items = r.data?.value || [];

      return items.map((e) => ({
        id: e.id,
        title: e.subject || "(Sin título)",
        start: e.start?.dateTime,
        end: e.end?.dateTime,
        allDay: !!e.isAllDay,
        extendedProps: {
          calendarId: idOrNull || "primary",
          location: e.location?.displayName || "",
          preview: e.bodyPreview || "",
          organizer:
            e.organizer?.emailAddress?.name ||
            e.organizer?.emailAddress?.address ||
            "",
          attendees: (e.attendees || [])
            .map((a) => a?.emailAddress?.name || a?.emailAddress?.address)
            .filter(Boolean),
          categories: e.categories || [],
          webLink: e.webLink || "",
        },
      }));
    }

    let events = [];

    if (calendarIds.length) {
      // ✅ Varios calendarios (incluye "primary" si lo mandas)
      const batches = await Promise.allSettled(
        calendarIds.map((id) => {
          if (id === "primary") return fetchCalendarViewFor(null);
          return fetchCalendarViewFor(id);
        })
      );

      for (const b of batches) {
        if (b.status === "fulfilled") events = events.concat(b.value);
      }
    } else if (calendarId) {
      // ✅ Uno
      events =
        calendarId === "primary"
          ? await fetchCalendarViewFor(null)
          : await fetchCalendarViewFor(calendarId);
    } else {
      // ✅ Default: principal
      events = await fetchCalendarViewFor(null);
    }

    // ✅ Quita duplicados por id
    const seen = new Set();
    events = events.filter((ev) => {
      const key = String(ev.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json(events);
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || null;

    console.error("CALENDAR GET ERROR:", status, data || err.message);

    // si Graph dijo token inválido, limpia sesión MS para forzar reconectar
    if (status === 401) {
      if (req.session?.ms) {
        req.session.ms.accessToken = null;
        req.session.ms.expiresAt = null;
      }
    }

    res.status(status).json({
      mensaje: "Error al obtener eventos de Outlook",
      detalle: data || err.message,
    });
  }
});

/**
 * POST /api/calendar/events
 * Body: { subject, start, end }
 * (se crea en el calendario principal del usuario)
 */
router.post("/events", auth, async (req, res) => {
  try {
    const subject = String(req.body.subject || "").trim();
    const start = String(req.body.start || "").trim();
    const end = String(req.body.end || "").trim();

    if (!subject || !start || !end) {
      return res
        .status(400)
        .json({ mensaje: "subject, start y end requeridos" });
    }

    const accessToken = await getMsAccessToken(req);
    if (!accessToken) {
      return res.status(401).json({
        mensaje: "Outlook no conectado. Inicia en /auth/microsoft/login",
      });
    }

    const timeZoneStart = pickTimeZone(start);
    const timeZoneEnd = pickTimeZone(end);

    const payload = {
      subject,
      start: { dateTime: start, timeZone: timeZoneStart },
      end: { dateTime: end, timeZone: timeZoneEnd },
    };

    const url = "https://graph.microsoft.com/v1.0/me/events";
    const graphResp = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    res.status(201).json({
      id: graphResp.data?.id,
      ok: true,
    });
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
 * Debug: devuelve el usuario conectado en Microsoft
 */
router.get("/me", auth, async (req, res) => {
  try {
    const accessToken = await getMsAccessToken(req);
    if (!accessToken)
      return res.status(401).json({ mensaje: "Outlook no conectado" });

    const me = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    res.json({
      id: me.data.id,
      displayName: me.data.displayName,
      userPrincipalName: me.data.userPrincipalName,
      mail: me.data.mail,
    });
  } catch (e) {
    res
      .status(500)
      .json({ mensaje: "Error /me", detalle: e.response?.data || e.message });
  }
});

/**
 * Debug: calendarView raw del principal
 */
router.get("/events-raw", auth, async (req, res) => {
  try {
    const start = String(req.query.start || "").trim();
    const end = String(req.query.end || "").trim();
    if (!start || !end)
      return res.status(400).json({ mensaje: "start y end requeridos" });

    const accessToken = await getMsAccessToken(req);
    if (!accessToken)
      return res.status(401).json({ mensaje: "Outlook no conectado" });

    const graphResp = await axios.get(
      "https://graph.microsoft.com/v1.0/me/calendarView",
      {
        params: {
          startDateTime: start,
          endDateTime: end,
          $select: "id,subject,start,end,isAllDay",
          $top: 200,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: `outlook.timezone="${DEFAULT_TZ}"`,
        },
      }
    );

    res.json({
      start,
      end,
      count: graphResp.data?.value?.length || 0,
      sample: (graphResp.data?.value || []).slice(0, 5),
    });
  } catch (e) {
    res.status(500).json({
      mensaje: "Error events-raw",
      detalle: e.response?.data || e.message,
    });
  }
});

/**
 * GET /api/calendar/calendars
 * Lista calendarios del usuario
 */
router.get("/calendars", auth, async (req, res) => {
  try {
    const accessToken = await getMsAccessToken(req);
    if (!accessToken) {
      return res.status(401).json({ mensaje: "Outlook no conectado" });
    }

    const r = await axios.get("https://graph.microsoft.com/v1.0/me/calendars", {
      params: { $select: "id,name,canEdit,owner", $top: 200 },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const calendars = (r.data?.value || []).map((c) => ({
      id: c.id,
      name: c.name,
      canEdit: !!c.canEdit,
      owner: c.owner?.name || null,
    }));

    res.json(calendars);
  } catch (e) {
    res.status(500).json({
      mensaje: "Error al listar calendarios",
      detalle: e.response?.data || e.message,
    });
  }
});

module.exports = router;
