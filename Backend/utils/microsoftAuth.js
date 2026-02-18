// Backend/utils/microsoftAuth.js
const axios = require("axios");
const qs = require("qs");

const {
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_TENANT,
  MS_REDIRECT_URI,
} = process.env;

const BASE = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0`;

const SCOPE = "openid profile offline_access User.Read Calendars.ReadWrite";

exports.getAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: MS_REDIRECT_URI,
    response_mode: "query",
    scope: SCOPE,
    prompt: "select_account",
  });

  return `${BASE}/authorize?${params.toString()}`;
};

// Devuelve tokens para guardarlos en sesión
exports.exchangeCodeForToken = async (code) => {
  const data = qs.stringify({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: MS_REDIRECT_URI,
  });

  const res = await axios.post(`${BASE}/token`, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const expiresIn = Number(res.data.expires_in || 0);
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
};

// Usa refreshToken (de sesión) para sacar un access token nuevo
exports.refreshAccessToken = async (refreshToken) => {
  const data = qs.stringify({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPE,
  });

  const res = await axios.post(`${BASE}/token`, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const expiresIn = Number(res.data.expires_in || 0);
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token || null, // a veces rota
    expiresAt: Date.now() + expiresIn * 1000,
  };
};
