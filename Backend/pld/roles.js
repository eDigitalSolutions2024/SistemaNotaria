'use strict';

// Roles PLD (independientes del sistema de turnos)
const PLD_ROLES = Object.freeze({
  ADMINISTRADOR: 'ADMINISTRADOR',
  OFICIAL_PLD:   'OFICIAL_PLD',
  NOTARIO:       'NOTARIO',
  CAPTURISTA:    'CAPTURISTA',
  CONSULTA:      'CONSULTA',
});

// Mapa de roles del sistema (Abogado.role) → rol PLD equivalente
// OFICIAL_PLD se incorporará cuando se extienda el modelo Abogado
const MAPA_ROL_SISTEMA = Object.freeze({
  ADMIN:       PLD_ROLES.ADMINISTRADOR,
  ABOGADO:     PLD_ROLES.NOTARIO,
  ASISTENTE:   PLD_ROLES.CAPTURISTA,
  PROTOCOLITO: PLD_ROLES.CONSULTA,
  RECEPCION:   PLD_ROLES.CONSULTA,
});

// Permisos por rol PLD
const PERMISOS_PLD = Object.freeze({
  [PLD_ROLES.ADMINISTRADOR]: {
    puedeDetectar:   true,
    puedeEditar:     true,
    puedePresentar:  true,
    puedeVerTodo:    true,   // sin filtro de abogado
    puedeCancelar:   true,
  },
  [PLD_ROLES.OFICIAL_PLD]: {
    puedeDetectar:   true,
    puedeEditar:     true,
    puedePresentar:  true,
    puedeVerTodo:    true,
    puedeCancelar:   true,
  },
  [PLD_ROLES.NOTARIO]: {
    puedeDetectar:   true,
    puedeEditar:     true,
    puedePresentar:  true,
    puedeVerTodo:    false,  // solo sus propios avisos
    puedeCancelar:   true,
  },
  [PLD_ROLES.CAPTURISTA]: {
    puedeDetectar:   true,
    puedeEditar:     true,
    puedePresentar:  false,
    puedeVerTodo:    false,
    puedeCancelar:   false,
  },
  [PLD_ROLES.CONSULTA]: {
    puedeDetectar:   false,
    puedeEditar:     false,
    puedePresentar:  false,
    puedeVerTodo:    false,
    puedeCancelar:   false,
  },
});

/**
 * Resuelve el rol PLD a partir del role del sistema (req.user.role).
 * Retorna null si el rol no tiene acceso PLD.
 */
function resolverRolPLD(rolesSistema) {
  return MAPA_ROL_SISTEMA[rolesSistema] || null;
}

/**
 * Middleware: verifica que el usuario tiene al menos el permiso requerido.
 *
 * @param {string} permiso — clave de PERMISOS_PLD (e.g. 'puedeDetectar')
 */
function requirePermisoPLD(permiso) {
  return (req, res, next) => {
    const rolPLD = resolverRolPLD(req.user?.role);
    if (!rolPLD) {
      return res.status(403).json({ mensaje: 'Sin acceso al módulo PLD.' });
    }
    const permisos = PERMISOS_PLD[rolPLD];
    if (!permisos || !permisos[permiso]) {
      return res.status(403).json({
        mensaje: `Rol ${rolPLD} no tiene permiso: ${permiso}.`,
      });
    }
    req.rolPLD    = rolPLD;
    req.permisos  = permisos;
    next();
  };
}

/**
 * Construye el filtro de Mongoose para limitar avisos al scope del usuario.
 * ADMINISTRADOR / OFICIAL_PLD → sin filtro.
 * Resto → solo avisos donde abogado === req.user.nombre.
 */
function buildFiltroScope(req) {
  if (req.permisos?.puedeVerTodo) return {};
  return { abogado: req.user.nombre };
}

module.exports = { PLD_ROLES, PERMISOS_PLD, resolverRolPLD, requirePermisoPLD, buildFiltroScope };
