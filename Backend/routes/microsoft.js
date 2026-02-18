const express = require("express");
const router = express.Router();

const {
  getAuthUrl,
  exchangeCodeForToken
} = require("../utils/microsoftAuth");

router.get("/login", (req, res) => {
  res.redirect(getAuthUrl());
});


router.get("/callback", async (req, res) => {
  console.log("CALLBACK URL:", req.originalUrl);
  console.log("CALLBACK QUERY:", req.query);

  const code = req.query.code;
  const err = req.query.error;

  if (err) return res.status(400).send("Microsoft devolvió error: " + err);
  if (!code) {
    return res
      .status(400)
      .send("No llegó ?code=. Inicia desde /auth/microsoft/login");
  }

  try {
    const tokens = await exchangeCodeForToken(code);

    req.session.ms = {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    };

    await new Promise((resolve, reject) => {
      req.session.save((e) => (e ? reject(e) : resolve()));
    });

    res.redirect(process.env.FRONTEND_URL + "/calendario");
  } catch (e) {
    console.error("MICROSOFT CALLBACK ERROR:", e.response?.data || e.message);
    res.status(500).send("Error al conectar con Microsoft");
  }
});


module.exports = router;
