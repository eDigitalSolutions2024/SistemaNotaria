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

// Overrides de rol PLD por usuario individual (Abogado._id), para casos que
// no encajan en el mapeo genérico por rol del sistema y no ameritan
// re-clasificar a todos los usuarios de ese rol.
const PLD_OVERRIDE_POR_USUARIO = Object.freeze({
  1017: PLD_ROLES.CAPTURISTA, // Fátima (RECEPCION) — acceso de captura a PLD
});

/**
 * Resuelve el rol PLD a partir del usuario del sistema (req.user).
 * Acepta el objeto req.user completo (con id/role) o, por compatibilidad,
 * directamente el string de role. Retorna null si no tiene acceso PLD.
 */
function resolverRolPLD(userOrRole) {
  const esObjeto = userOrRole && typeof userOrRole === 'object';
  const id = esObjeto ? userOrRole.id : undefined;
  if (id != null && PLD_OVERRIDE_POR_USUARIO[id]) {
    return PLD_OVERRIDE_POR_USUARIO[id];
  }
  const rol = esObjeto ? userOrRole.role : userOrRole;
  // Normaliza mayúsculas/minúsculas: la colección de abogados tiene roles
  // guardados de forma inconsistente (ej. "admin" en vez de "ADMIN" para el
  // usuario Administrador semilla), y este mapa siempre usa claves en
  // mayúsculas.
  const clave = String(rol || '').toUpperCase();
  return MAPA_ROL_SISTEMA[clave] || null;
}

/**
 * Middleware: verifica que el usuario tiene al menos el permiso requerido.
 *
 * @param {string} permiso — clave de PERMISOS_PLD (e.g. 'puedeDetectar')
 */
function requirePermisoPLD(permiso) {
  return (req, res, next) => {
    const rolPLD = resolverRolPLD(req.user);
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
