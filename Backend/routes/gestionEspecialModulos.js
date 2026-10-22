// routes/gestionEspecialModulos.js
// CRUD simple del catálogo de módulos de "Gestiones especiales". Crear/
// renombrar/cambiar visibilidad/desactivar es solo para ADMIN; listar lo
// puede ver cualquiera con sesión (el propio listado ya filtra lo que no
// le toca ver a un no-admin).
const express = require('express');
const router = express.Router();

const GestionEspecialModulo = require('../models/GestionEspecialModulo');
const auth = require('../middleware/auth');

function getRole(req) {
  return String(req.user?.role || req.user?.rol || '').toUpperCase();
}
function esAdmin(req) {
  return getRole(req) === 'ADMIN';
}

// GET /gestion-especial-modulos — lista los módulos activos. Un no-admin
// solo ve los que no son soloAdmin (defensa en servidor, no solo en el menú).
router.get('/', auth, async (req, res) => {
  try {
    const q = { activo: true };
    if (!esAdmin(req)) q.soloAdmin = false;
    const modulos = await GestionEspecialModulo.find(q).sort({ createdAt: 1 }).lean();
    res.json(modulos);
  } catch (e) {
    console.error('GET /gestion-especial-modulos ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo cargar la lista de módulos.' });
  }
});

// POST /gestion-especial-modulos  { nombre, soloAdmin }
router.post('/', auth, async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ mensaje: 'Solo un administrador puede crear módulos.' });
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre del módulo es obligatorio.' });

    const existente = await GestionEspecialModulo.findOne({ nombre });
    if (existente) {
      if (existente.activo) return res.status(400).json({ mensaje: `Ya existe un módulo llamado "${nombre}".` });
      // Reactivar uno que se había ocultado, en vez de duplicar el nombre.
      existente.activo = true;
      existente.soloAdmin = req.body?.soloAdmin !== false;
      await existente.save();
      return res.status(201).json(existente);
    }

    const modulo = await GestionEspecialModulo.create({
      nombre,
      soloAdmin: req.body?.soloAdmin !== false,
      creadoPorId: req.user?.id ?? null,
      creadoPorNombre: req.user?.nombre || '',
    });
    res.status(201).json(modulo);
  } catch (e) {
    console.error('POST /gestion-especial-modulos ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo crear el módulo.' });
  }
});

// PATCH /gestion-especial-modulos/:id  { nombre?, soloAdmin?, activo? }
router.patch('/:id', auth, async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ mensaje: 'Solo un administrador puede modificar módulos.' });
    const modulo = await GestionEspecialModulo.findById(req.params.id);
    if (!modulo) return res.status(404).json({ mensaje: 'Módulo no encontrado.' });

    if (req.body?.nombre !== undefined) modulo.nombre = String(req.body.nombre).trim();
    if (req.body?.soloAdmin !== undefined) modulo.soloAdmin = Boolean(req.body.soloAdmin);
    if (req.body?.activo !== undefined) modulo.activo = Boolean(req.body.activo);

    await modulo.save();
    res.json(modulo);
  } catch (e) {
    console.error('PATCH /gestion-especial-modulos/:id ERROR:', e);
    res.status(500).json({ mensaje: 'No se pudo actualizar el módulo.' });
  }
});

module.exports = router;
