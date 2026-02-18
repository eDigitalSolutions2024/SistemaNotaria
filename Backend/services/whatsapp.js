// backend/services/whatsapp.js
const axios = require("axios");
const FormData = require("form-data");

const GRAPH = "https://graph.facebook.com/v22.0";

function cleanPhone(raw) {
  return String(raw || "").replace(/[^\d]/g, "");
}

// ✅ 1) Subir media a WhatsApp (PDF) y obtener media_id
async function uploadMediaFromUrl({ fileUrl, mimeType = "application/pdf" }) {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.WA_ACCESS_TOKEN;

  if (!phoneNumberId || !token) throw new Error("WA_CONFIG_MISSING");
  if (!fileUrl) throw new Error("WA_FILE_URL_MISSING");

  // 1) Descargar el PDF desde tu propio backend (localhost sí sirve aquí)
  const fileRes = await axios.get(fileUrl, { responseType: "arraybuffer" });

  // 2) Subir a Meta como media
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", Buffer.from(fileRes.data), {
    filename: "presupuesto.pdf",
    contentType: mimeType,
  });

  const uploadUrl = `${GRAPH}/${phoneNumberId}/media`;

  const upRes = await axios.post(uploadUrl, form, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
  });

  return upRes.data; // { id: "MEDIA_ID" }
}

// ✅ 2) Enviar documento usando el media_id
async function sendDocumentById({ to, mediaId, filename = "presupuesto.pdf", caption = "" }) {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.WA_ACCESS_TOKEN;

  if (!phoneNumberId || !token) throw new Error("WA_CONFIG_MISSING");
  if (!to) throw new Error("WA_TO_MISSING");
  if (!mediaId) throw new Error("WA_MEDIA_ID_MISSING");

  const url = `${GRAPH}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone(to),
    type: "document",
    document: {
      id: mediaId,
      filename,
      caption,
    },
  };

  const res = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data;
}

module.exports = {
  cleanPhone,
  uploadMediaFromUrl,
  sendDocumentById,
};
