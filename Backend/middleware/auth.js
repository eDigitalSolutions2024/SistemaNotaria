// Backend/middleware/auth.js
const jwt = require('jsonwebtoken');

function getTokenFromHeader(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

exports.requireAuth = (req, res, next) => {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ mensaje: 'Token requerido' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, nombre, role }
    next();
  } catch (e) {
    return res.status(401).json({ mensaje: 'Token inválido' });
  }
};

exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ mensaje: 'No autenticado' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ mensaje: 'No autorizado' });
  }
  next();
};
