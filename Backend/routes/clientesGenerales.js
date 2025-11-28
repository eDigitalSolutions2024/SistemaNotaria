const express = require('express');
const router = express.Router();

const Cliente = require('../models/Cliente');
const ClienteGeneral = require('../models/ClienteGeneral');

const puppeteer = require('puppeteer');
const generarHTMLDatosGenerales = require('../pdf-templates/generarHTMLDatosGenerales');

// 🔹 Crear uno o varios registros de datos generales
// Espera en el body:
// {
//   "clienteId": 123,
//   "personas": [
//     { nombre_completo, lugar_nacimiento, ... },
//     { ... }
//   ]
// }
router.post('/', async (req, res) => {
  try {
    console.log('BODY /api/clientes-generales =>', req.body);
    const { clienteId, personas } = req.body;

    if (!clienteId || !Array.isArray(personas) || personas.length === 0) {
      return res.status(400).json({ message: 'clienteId y al menos una persona son obligatorios.' });
    }

    // Verificar que el cliente exista y que su estado sea Asignado o Finalizado
    const cliente = await Cliente.findOne({ _id: clienteId });

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado.' });
    }

    if (!['Asignado', 'Finalizado'].includes(cliente.estado)) {
      return res.status(400).json({
        message: 'Solo se pueden registrar datos generales para clientes Asignados o Finalizados.',
      });
    }

    // Agregar el clienteId a cada persona
    const docs = personas.map((p) => ({
      ...p,
      clienteId,
    }));

    const creados = await ClienteGeneral.insertMany(docs);

    res.status(201).json(creados);
  } catch (error) {
    console.error('Error al crear datos generales:', error);
    res.status(500).json({ message: 'Error al crear datos generales', error: error.message });
  }
});

// 🔹 Obtener todos los datos generales de un cliente
// GET /api/clientes-generales/por-cliente/123
router.get('/por-cliente/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;

    const registros = await ClienteGeneral.find({ clienteId: Number(clienteId) }).sort({ createdAt: 1 });

    res.json(registros);
  } catch (error) {
    console.error('Error al obtener datos generales por cliente:', error);
    res.status(500).json({ message: 'Error al obtener datos generales', error: error.message });
  }
});

// 🔹 Obtener los datos listos para PDF de un cliente
// GET /api/clientes-generales/pdf-data/:clienteId
router.get('/pdf-data/:clienteId', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const clienteIdNum = Number(clienteId);

    if (!clienteId || Number.isNaN(clienteIdNum)) {
      return res.status(400).json({ message: 'clienteId inválido.' });
    }

    // 1) Buscar cliente
    const cliente = await Cliente.findOne({ _id: clienteIdNum });

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado.' });
    }

    // 2) Buscar datos generales del cliente
    const registros = await ClienteGeneral
      .find({ clienteId: clienteIdNum })
      .sort({ createdAt: 1 });

    if (!registros || registros.length === 0) {
      return res.status(404).json({
        message: 'Este cliente no tiene datos generales registrados.'
      });
    }

    // 3) Armar objeto pdfData
    const pdfData = {
      notaria: {
        nombre: 'Notaría 17',
        direccion: 'Dirección de la notaría',   // <- aquí luego lo ajustas
        telefono: 'Teléfono de la notaría',     // <- igual, a tu gusto
      },
      cliente: {
        id: cliente._id,
        nombre: cliente.nombre,
        numero_telefono: cliente.numero_telefono,
        estado: cliente.estado,
        servicio: cliente.servicio,
        tieneCita: cliente.tieneCita,
        hora_llegada: cliente.hora_llegada,
      },
      generales: {
        fechaRegistro: registros[0]?.createdAt ?? null,
        personas: registros.map((p, i) => ({
          indice: i + 1,
          nombre_completo: p.nombre_completo,
          lugar_nacimiento: p.lugar_nacimiento,
          fecha_nacimiento: p.fecha_nacimiento,
          ocupacion: p.ocupacion,
          estado_civil: p.estado_civil,
          domicilio: p.domicilio,
          colonia: p.colonia,
          telefono_principal: p.telefono_principal,
          telefono_secundario: p.telefono_secundario,
          correo_electronico: p.correo_electronico,
          curp: p.curp,
          rfc: p.rfc,
        })),
      },
      generadoEl: new Date(),
    };

    return res.json({
      ok: true,
      data: pdfData,
    });
  } catch (error) {
    console.error('Error al obtener datos para PDF:', error);
    return res.status(500).json({
      message: 'Error al obtener datos para PDF',
      error: error.message,
    });
  }
});

// 🔹 Generar PDF de datos generales de un cliente
// GET /api/clientes-generales/pdf/:clienteId
router.get('/pdf/:clienteId', async (req, res) => {
  const { clienteId } = req.params;
  const clienteIdNum = Number(clienteId);

  if (!clienteId || Number.isNaN(clienteIdNum)) {
    return res.status(400).json({ message: 'clienteId inválido.' });
  }

  let browser;
  try {
    // 1) Buscar cliente
    const cliente = await Cliente.findOne({ _id: clienteIdNum });

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado.' });
    }

    // 2) Buscar datos generales del cliente
    const registros = await ClienteGeneral
      .find({ clienteId: clienteIdNum })
      .sort({ createdAt: 1 });

    if (!registros || registros.length === 0) {
      return res.status(404).json({
        message: 'Este cliente no tiene datos generales registrados.'
      });
    }

    // 3) Armar objeto pdfData (mismo formato que en /pdf-data)
    const pdfData = {
      notaria: {
        nombre: 'Notaría 17',
        direccion: 'Dirección de la notaría',   // luego lo ajustas
        telefono: 'Teléfono de la notaría',     // idem
      },
      cliente: {
        id: cliente._id,
        nombre: cliente.nombre,
        numero_telefono: cliente.numero_telefono,
        estado: cliente.estado,
        servicio: cliente.servicio,
        tieneCita: cliente.tieneCita,
        hora_llegada: cliente.hora_llegada,
      },
      generales: {
        fechaRegistro: registros[0]?.createdAt ?? null,
        personas: registros.map((p, i) => ({
          indice: i + 1,
          nombre_completo: p.nombre_completo,
          lugar_nacimiento: p.lugar_nacimiento,
          fecha_nacimiento: p.fecha_nacimiento,
          ocupacion: p.ocupacion,
          estado_civil: p.estado_civil,
          domicilio: p.domicilio,
          colonia: p.colonia,
          telefono_principal: p.telefono_principal,
          telefono_secundario: p.telefono_secundario,
          correo_electronico: p.correo_electronico,
          curp: p.curp,
          rfc: p.rfc,
        })),
      },
      generadoEl: new Date(),
    };

    // 4) Generar HTML a partir de pdfData
    const html = generarHTMLDatosGenerales(pdfData);

    // 5) Lanzar Puppeteer y crear PDF
    browser = await puppeteer.launch({
      headless: 'new',                    // o true, según tu versión
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // setContent con el HTML generado
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    // 6) Devolver PDF al navegador
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="datos-generales-${clienteIdNum}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error al generar PDF de datos generales:', error);
    return res.status(500).json({
      message: 'Error al generar PDF de datos generales',
      error: error.message,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});



// 🔹 Obtener un registro específico de datos generales
// GET /api/clientes-generales/645f...
router.get('/:id', async (req, res) => {
  try {
    const registro = await ClienteGeneral.findById(req.params.id);
    if (!registro) {
      return res.status(404).json({ message: 'Registro no encontrado.' });
    }
    res.json(registro);
  } catch (error) {
    console.error('Error al obtener el registro:', error);
    res.status(500).json({ message: 'Error al obtener el registro', error: error.message });
  }
});

// 🔹 Actualizar un registro específico de datos generales
// PUT /api/clientes-generales/645f...
router.put('/:id', async (req, res) => {
  try {
    const actualizado = await ClienteGeneral.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!actualizado) {
      return res.status(404).json({ message: 'Registro no encontrado.' });
    }

    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar datos generales:', error);
    res.status(500).json({ message: 'Error al actualizar datos generales', error: error.message });
  }
});

// 🔹 (Opcional) Eliminar un registro de datos generales
// DELETE /api/clientes-generales/645f...
router.delete('/:id', async (req, res) => {
  try {
    const eliminado = await ClienteGeneral.findByIdAndDelete(req.params.id);

    if (!eliminado) {
      return res.status(404).json({ message: 'Registro no encontrado.' });
    }

    res.json({ message: 'Registro eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar datos generales:', error);
    res.status(500).json({ message: 'Error al eliminar datos generales', error: error.message });
  }
});

module.exports = router;
