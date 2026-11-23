// Backend/routes/microsoft.js
// Retorno de Microsoft tras iniciar sesión. Guarda la conexión COMPARTIDA de la
// notaría (no por usuario). Solo se acepta si trae el "state" firmado que emite
// POST /api/calendar/connect-url (que exige ser ADMIN).
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const router = express.Router();

const { exchangeCodeForToken } = require("../utils/microsoftAuth");
const svc = require("../services/outlookService");

const frontUrl = () => String(process.env.FRONTEND_URL || "").replace(/\/+$/, "");

router.get("/callback", async (req, res) => {
  const code = req.query.code;
  const err = req.query.error;

  if (err) {
    return res.status(400).send("Microsoft devolvió error: " + err);
  }
  if (!code) {
    return res.status(400).send("No llegó ?code=. Inicia desde el botón Conectar Outlook del sistema.");
  }

  // El state prueba que un ADMIN autenticado inició la conexión
  let user;
  try {
    const payload = jwt.verify(String(req.query.state || ""), process.env.JWT_SECRET || "dev_secret");
    if (payload.purpose !== "ms-connect") throw new Error("state inválido");
    user = { id: payload.id, nombre: payload.nombre };
  } catch {
    return res
      .status(400)
      .send("La solicitud de conexión no es válida o venció. Vuelve a intentarlo desde el sistema.");
  }

  try {
    const tokens = await exchangeCodeForToken(code);

    // Correo de la cuenta conectada (para mostrarlo y detectar cambios de cuenta)
    let account = "";
    try {
      const me = await axios.get("https://graph.microsoft.com/v1.0/me", {
        params: { $select: "mail,userPrincipalName,displayName" },
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      account = me.data.mail || me.data.userPrincipalName || me.data.displayName || "";
    } catch (e) {
      console.warn("No se pudo leer /me tras conectar:", e.response?.status);
    }

    await svc.saveConnection({ ...tokens, account, user });

    // Primera sincronización en segundo plano (no hace esperar al usuario)
    svc.syncAll().catch((e) =>
      console.error("SYNC inicial tras conectar:", e.response?.data?.error || e.message)
    );

    res.redirect(frontUrl() + "/calendario");
  } catch (e) {
    console.error("MICROSOFT CALLBACK ERROR:", e.response?.data || e.message);
    res.status(500).send("Error al conectar con Microsoft");
  }
});

module.exports = router;
