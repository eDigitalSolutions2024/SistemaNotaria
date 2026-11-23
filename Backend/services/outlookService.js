// Backend/services/outlookService.js
// Conexión compartida con Outlook + sincronización incremental (delta) hacia
// MongoDB. La pantalla del calendario lee de la base de datos; este servicio
// se encarga de mantenerla al día pidiendo a Microsoft SOLO lo que cambió.
const crypto = require("crypto");
const axios = require("axios");

const OutlookConexion = require("../models/OutlookConexion");
const OutlookEvento = require("../models/OutlookEvento");
const OutlookSync = require("../models/OutlookSync");
const { refreshAccessToken } = require("../utils/microsoftAuth");
const { graphLimited, isTransient } = require("../utils/graphGate");

const GRAPH = "https://graph.microsoft.com/v1.0";
const CLAVE = "principal";

// Zona horaria de Outlook. Cd. Juárez sigue horario de EE.UU. (Mountain).
const OUTLOOK_TZ = process.env.OUTLOOK_TZ || "Mountain Standard Time";

// ---------- Colores (igual que Outlook) ----------
const PRESET_COLORS = {
  preset0: "#E74856", preset1: "#F7630C", preset2: "#8E562E", preset3: "#FFB900",
  preset4: "#2ECC71", preset5: "#1ABC9C", preset6: "#8A8A2A", preset7: "#2F7DE1",
  preset8: "#A259D9", preset9: "#E0559C", preset10: "#7A9CC6", preset11: "#5B7799",
  preset12: "#A0A0A0", preset13: "#6E6E6E", preset14: "#333333", preset15: "#A4262C",
  preset16: "#CA5010", preset17: "#5E3A1E", preset18: "#C19C00", preset19: "#0B6A0B",
  preset20: "#006666", preset21: "#4B5320", preset22: "#0F4C9C", preset23: "#5C2D91",
  preset24: "#A21C58",
};

const CAL_COLORS = {
  lightBlue: "#4F9CF0", lightGreen: "#4CC38A", lightOrange: "#F5A25D",
  lightGray: "#A0A0A0", lightYellow: "#F2D14B", lightTeal: "#3CC8C8",
  lightPink: "#F189B8", lightBrown: "#B08968", lightRed: "#EF6B6B",
  maxColor: "#888888",
};

function calendarColor(c) {
  if (c?.hexColor) return c.hexColor;
  return CAL_COLORS[c?.color] || null;
}

// ---------- Cifrado de tokens en reposo (AES-256-GCM) ----------
function cryptoKey() {
  const secret =
    process.env.OUTLOOK_TOKEN_KEY || process.env.JWT_SECRET || "dev_secret";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function enc(text) {
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const data = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function dec(s) {
  if (!s) return "";
  const [iv, tag, data] = s.split(".").map((x) => Buffer.from(x, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", cryptoKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

// ---------- Conexión ----------
async function getConexion() {
  return OutlookConexion.findOne({ clave: CLAVE });
}

async function saveConnection({ refreshToken, accessToken, expiresAt, account, user }) {
  const prev = await OutlookConexion.findOne({ clave: CLAVE }).lean();

  // Si se conecta OTRA cuenta, lo guardado de la anterior ya no aplica.
  if (prev?.account && account && prev.account.toLowerCase() !== account.toLowerCase()) {
    await Promise.all([OutlookEvento.deleteMany({}), OutlookSync.deleteMany({})]);
  }

  await OutlookConexion.findOneAndUpdate(
    { clave: CLAVE },
    {
      $set: {
        account: account || prev?.account || "",
        refreshTokenEnc: enc(refreshToken),
        accessTokenEnc: enc(accessToken),
        expiresAt,
        conectadoPor: user ? { id: user.id, nombre: user.nombre } : null,
        conectadoEn: new Date(),
        ultimoError: "",
        syncLockUntil: null,
      },
    },
    { upsert: true, new: true }
  );
}

async function disconnect() {
  await Promise.all([
    OutlookConexion.deleteMany({ clave: CLAVE }),
    OutlookEvento.deleteMany({}),
    OutlookSync.deleteMany({}),
  ]);
}

let refreshing = null;

// Access token válido (lo renueva con el refresh token cuando hace falta).
// Devuelve null si no hay conexión.
async function getAccessToken() {
  const conn = await getConexion();
  if (!conn || !conn.refreshTokenEnc) return null;

  if (conn.accessTokenEnc && conn.expiresAt && conn.expiresAt - 60_000 > Date.now()) {
    return dec(conn.accessTokenEnc);
  }

  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await refreshAccessToken(dec(conn.refreshTokenEnc));
        conn.accessTokenEnc = enc(r.accessToken);
        conn.expiresAt = r.expiresAt;
        if (r.refreshToken) conn.refreshTokenEnc = enc(r.refreshToken);
        conn.ultimoError = "";
        await conn.save();
        return r.accessToken;
      } catch (e) {
        const code = e.response?.data?.error;
        if (code === "invalid_grant" || code === "interaction_required") {
          conn.ultimoError =
            "La conexión con Outlook venció. Un administrador debe volver a conectar.";
          await conn.save();
        }
        throw e;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

// ---------- Utilidades Graph ----------
async function graphGetAll(url, params, headers, maxPages = 20) {
  const out = [];
  let next = url;
  let first = true;
  for (let i = 0; next && i < maxPages; i++) {
    const r = await graphLimited(() =>
      axios.get(next, { params: first ? params : undefined, headers })
    );
    first = false;
    out.push(...(r.data?.value || []));
    next = r.data?.["@odata.nextLink"] || null;
  }
  return out;
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Ventana sincronizada: desde el mes anterior hasta 13 meses adelante.
function syncWindow() {
  const n = new Date();
  return {
    start: ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
    end: ymd(new Date(n.getFullYear(), n.getMonth() + 13, 1)),
  };
}

// ---------- Catálogo: calendarios y categorías ----------
let metaInflight = null;

async function refreshMeta() {
  if (metaInflight) return metaInflight;
  metaInflight = (async () => {
    const token = await getAccessToken();
    if (!token) return null;
    const h = { Authorization: `Bearer ${token}` };
    const conn = await getConexion();

    const cals = await graphGetAll(
      `${GRAPH}/me/calendars`,
      { $select: "id,name,canEdit,owner,color,hexColor,isDefaultCalendar", $top: 100 },
      h
    );
    conn.calendarios = cals.map((c) => ({
      id: c.isDefaultCalendar ? "primary" : c.id,
      graphId: c.id,
      name: c.name,
      canEdit: !!c.canEdit,
      owner: c.owner?.name || null,
      color: calendarColor(c),
      isDefault: !!c.isDefaultCalendar,
    }));

    try {
      const r = await graphLimited(() =>
        axios.get(`${GRAPH}/me/outlook/masterCategories`, { headers: h })
      );
      conn.categorias = (r.data?.value || []).map((c) => ({
        name: c.displayName,
        color: PRESET_COLORS[c.color] || null,
      }));
    } catch (e) {
      // Permiso faltante -> sin categorías; fallo temporal -> se conservan las anteriores
      if (!isTransient(e)) conn.categorias = [];
    }

    conn.metaEn = new Date();
    await conn.save();
    return conn;
  })();
  try {
    return await metaInflight;
  } finally {
    metaInflight = null;
  }
}

// ---------- Sincronización incremental ----------
function toDoc(calId, e) {
  return {
    calendarId: calId,
    eventId: e.id,
    subject: e.subject || "",
    start: String(e.start?.dateTime || "").slice(0, 19),
    end: String(e.end?.dateTime || e.start?.dateTime || "").slice(0, 19),
    isAllDay: !!e.isAllDay,
    location: e.location?.displayName || "",
    preview: e.bodyPreview || "",
    organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address || "",
    attendees: (e.attendees || [])
      .map((a) => a?.emailAddress?.name || a?.emailAddress?.address)
      .filter(Boolean),
    categories: e.categories || [],
    webLink: e.webLink || "",
  };
}

const SELECT =
  "id,subject,start,end,isAllDay,isCancelled,location,bodyPreview,organizer,attendees,categories,webLink";

// Recorre todas las páginas hasta recibir el deltaLink (marca de "al día").
async function pullDelta(startUrl, params, headers) {
  const items = [];
  let url = startUrl;
  let p = params;
  let delta = null;
  for (let i = 0; url && i < 300; i++) {
    const r = await graphLimited(() => axios.get(url, { params: p, headers }));
    p = undefined; // los siguientes enlaces ya traen sus parámetros
    items.push(...(r.data?.value || []));
    if (r.data?.["@odata.deltaLink"]) {
      delta = r.data["@odata.deltaLink"];
      url = null;
    } else {
      url = r.data?.["@odata.nextLink"] || null;
    }
  }
  if (!delta) throw new Error("Outlook no devolvió el marcador de sincronización");
  return { items, delta };
}

const inflight = new Map();

function syncCalendar(calId, opts) {
  if (inflight.has(calId)) return inflight.get(calId);
  const p = _syncCalendar(calId, opts || {}).finally(() => inflight.delete(calId));
  inflight.set(calId, p);
  return p;
}

async function _syncCalendar(calId, { force = false } = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Outlook no conectado");

  let conn = await OutlookConexion.findOne({ clave: CLAVE }).lean();
  if (!conn?.calendarios?.length) conn = (await refreshMeta())?.toObject?.() || conn;
  const cal = (conn?.calendarios || []).find((c) => c.id === calId);
  const graphId = calId === "primary" ? null : cal?.graphId || calId;

  const base = graphId
    ? `${GRAPH}/me/calendars/${encodeURIComponent(graphId)}/calendarView/delta`
    : `${GRAPH}/me/calendarView/delta`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Prefer: `outlook.timezone="${OUTLOOK_TZ}", odata.maxpagesize=100`,
  };

  const win = syncWindow();
  const st = await OutlookSync.findOne({ calendarId: calId }).lean();
  const needBaseline =
    force || !st || !st.deltaLink || st.windowStart !== win.start || st.tz !== OUTLOOK_TZ;

  async function baseline() {
    const params = {
      startDateTime: `${win.start}T00:00:00Z`,
      endDateTime: `${win.end}T00:00:00Z`,
    };
    let res;
    try {
      res = await pullDelta(base, { ...params, $select: SELECT }, headers);
    } catch (e) {
      if (e.response?.status !== 400) throw e;
      res = await pullDelta(base, params, headers); // sin $select si Graph no lo admite
    }
    const live = res.items.filter((e) => !e["@removed"] && !e.isCancelled);
    if (live.length) {
      await OutlookEvento.bulkWrite(
        live.map((e) => ({
          updateOne: {
            filter: { calendarId: calId, eventId: e.id },
            update: { $set: toDoc(calId, e) },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }
    // Lo que ya no aparece en Outlook se borra de la copia local
    await OutlookEvento.deleteMany({
      calendarId: calId,
      eventId: { $nin: live.map((e) => e.id) },
    });
    return res.delta;
  }

  async function incremental() {
    const res = await pullDelta(st.deltaLink, undefined, headers);
    const ops = [];
    for (const e of res.items) {
      if (e["@removed"] || e.isCancelled) {
        ops.push({ deleteOne: { filter: { calendarId: calId, eventId: e.id } } });
      } else {
        ops.push({
          updateOne: {
            filter: { calendarId: calId, eventId: e.id },
            update: { $set: toDoc(calId, e) },
            upsert: true,
          },
        });
      }
    }
    if (ops.length) await OutlookEvento.bulkWrite(ops, { ordered: false });
    return { delta: res.delta, changes: res.items.length };
  }

  try {
    let delta;
    let changes = null;
    if (needBaseline) {
      delta = await baseline();
    } else {
      try {
        ({ delta, changes } = await incremental());
      } catch (e) {
        // El marcador caducó o Outlook pide empezar de nuevo: se reconstruye
        if (e.response?.status === 410 || e.response?.status === 400) delta = await baseline();
        else throw e;
      }
    }
    await OutlookSync.findOneAndUpdate(
      { calendarId: calId },
      {
        $set: {
          deltaLink: delta,
          windowStart: win.start,
          windowEnd: win.end,
          tz: OUTLOOK_TZ,
          lastSync: new Date(),
          lastError: "",
        },
      },
      { upsert: true }
    );
    return { calId, baseline: needBaseline, changes };
  } catch (e) {
    const msg = e.response?.data?.error?.code || e.message || "error";
    await OutlookSync.findOneAndUpdate(
      { calendarId: calId },
      { $set: { lastError: String(msg).slice(0, 300) } },
      { upsert: true }
    ).catch(() => {});
    throw e;
  }
}

// Sincroniza todos los calendarios (el principal primero).
async function syncAll({ force = false } = {}) {
  const conn = await refreshMeta();
  if (!conn) return { ok: false, failed: 0, total: 0 };

  const ids = (conn.calendarios || []).map((c) => c.id);
  ids.sort((a, b) => (a === "primary" ? -1 : b === "primary" ? 1 : 0));

  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        await syncCalendar(id, { force });
      } catch (e) {
        failed++;
        console.error(
          "SYNC OUTLOOK falló:",
          id,
          e.response?.status || "",
          e.response?.data?.error?.code || e.message
        );
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));

  // Limpia lo de calendarios que ya no existen
  await Promise.all([
    OutlookEvento.deleteMany({ calendarId: { $nin: ids } }),
    OutlookSync.deleteMany({ calendarId: { $nin: ids } }),
  ]);

  return { ok: true, failed, total: ids.length };
}

// ---------- Programador ----------
function startScheduler() {
  if (process.env.OUTLOOK_SYNC_ENABLED === "false") return;
  const mins = Math.max(1, Number(process.env.OUTLOOK_SYNC_MINUTES) || 3);

  const tick = async () => {
    try {
      // Candado en Mongo: si hay varias instancias del servidor, solo una sincroniza
      const got = await OutlookConexion.findOneAndUpdate(
        {
          clave: CLAVE,
          refreshTokenEnc: { $ne: "" },
          $or: [{ syncLockUntil: null }, { syncLockUntil: { $lt: new Date() } }],
        },
        { $set: { syncLockUntil: new Date(Date.now() + 5 * 60_000) } }
      );
      if (!got) return;
      try {
        await syncAll();
      } finally {
        await OutlookConexion.updateOne({ clave: CLAVE }, { $set: { syncLockUntil: null } });
      }
    } catch (e) {
      console.error("SYNC OUTLOOK (programado):", e.response?.data?.error || e.message);
    }
  };

  setTimeout(tick, 10_000);
  const t = setInterval(tick, mins * 60_000);
  t.unref?.();
  console.log(`✅ Sincronización de Outlook cada ${mins} min`);
}

module.exports = {
  OUTLOOK_TZ,
  PRESET_COLORS,
  getConexion,
  saveConnection,
  disconnect,
  getAccessToken,
  refreshMeta,
  syncCalendar,
  syncAll,
  startScheduler,
  graphGetAll,
};
