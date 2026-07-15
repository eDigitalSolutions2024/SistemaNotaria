// src/components/pld/tabs/GenerarXMLTab.jsx
//
// "Generar" y "Descargar" son las únicas dos acciones reales de esta
// pantalla — nada más se agrega botones de relleno. El botón "Generar"
// solo aparece habilitado cuando estadoXML() (pldHelpers.js, compartida con
// ValidacionesTab) dice que no hay nada bloqueando: mismo criterio en las
// dos pantallas, para no mostrar una acción que el backend va a rechazar.
//
// Backend/pld/generadorXML.js sigue siendo la única fuente de verdad: si
// encuentra datos inválidos que el chequeo del cliente no alcanza a ver
// (formato de RFC/CURP/fecha, nacionalidad sin código ISO, etc.), el POST
// responde 422 con una lista de errores que se muestra tal cual — no se
// reescriben ni se inventan traducciones para esos mensajes.
import React, { useState } from 'react';
import { Box, Typography, Stack, Button, Alert, List, ListItem, ListItemText, CircularProgress } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { generarXML, obtenerAviso, descargarXML } from '../pldApi';
import { estadoXML } from '../pldHelpers';

export default function GenerarXMLTab({ aviso, completitud, puedeGenerar, onIrA, onGuardado }) {
  const [generando, setGenerando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { severidad, texto, detalles? }

  const tieneXML = !!aviso.xmlContenido;
  const xml = estadoXML(aviso, completitud);
  const versionActual = (aviso.versionesXML || []).find((v) => v.version === aviso.xmlVersion);

  async function handleGenerar() {
    setGenerando(true);
    setMensaje(null);
    try {
      await generarXML(aviso._id);
      const avisoActualizado = await obtenerAviso(aviso._id);
      onGuardado(avisoActualizado);
      setMensaje({ severidad: 'success', texto: `XML generado correctamente (versión ${avisoActualizado.xmlVersion}).` });
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 422 && Array.isArray(data?.errores)) {
        setMensaje({
          severidad: 'error',
          texto: 'El sistema encontró los siguientes problemas al generar el XML:',
          detalles: data.errores,
        });
      } else {
        setMensaje({ severidad: 'error', texto: data?.mensaje || 'Ocurrió un error al generar el XML.' });
      }
    } finally {
      setGenerando(false);
    }
  }

  async function handleDescargar() {
    setDescargando(true);
    setMensaje(null);
    try {
      const blob = await descargarXML(aviso._id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PLD-${aviso.numeroControl || aviso._id}-v${aviso.xmlVersion}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMensaje({ severidad: 'error', texto: err?.response?.data?.mensaje || 'No se pudo descargar el XML.' });
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>Generar XML</Typography>

      {tieneXML ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Versión actual: <b>{aviso.xmlVersion}</b> — generada el{' '}
          {new Date(aviso.xmlFechaGenerado).toLocaleString('es-MX')}
          {versionActual?.generadoPor ? ` por ${versionActual.generadoPor}` : ''}.
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Todavía no se ha generado ningún XML para este expediente.
        </Typography>
      )}

      <Alert severity={xml.severidad} icon={<DescriptionOutlinedIcon fontSize="small" />} sx={{ mb: 2 }}>
        {xml.texto}
      </Alert>

      {!xml.deshabilitado && !puedeGenerar && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Tu rol no tiene permiso para generar el XML. Contacta a un notario o administrador.
        </Alert>
      )}

      {mensaje && (
        <Alert severity={mensaje.severidad} sx={{ mb: 2 }} onClose={() => setMensaje(null)}>
          {mensaje.texto}
          {mensaje.detalles && (
            <List dense disablePadding sx={{ mt: 1 }}>
              {mensaje.detalles.map((d, i) => (
                <ListItem key={i} sx={{ py: 0 }}>
                  <ListItemText primary={d} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItem>
              ))}
            </List>
          )}
        </Alert>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 3 }}>
        {xml.deshabilitado ? (
          <Button variant="outlined" onClick={() => onIrA('validaciones')}>
            Ver qué falta
          </Button>
        ) : (
          puedeGenerar && (
            <Button
              variant="contained"
              startIcon={generando ? <CircularProgress size={16} color="inherit" /> : <DescriptionOutlinedIcon />}
              onClick={handleGenerar}
              disabled={generando}
            >
              {generando ? 'Generando…' : tieneXML ? 'Regenerar XML' : 'Generar XML'}
            </Button>
          )
        )}
        {tieneXML && (
          <Button
            variant="outlined"
            startIcon={descargando ? <CircularProgress size={16} /> : <DownloadOutlinedIcon />}
            onClick={handleDescargar}
            disabled={descargando}
          >
            {descargando ? 'Descargando…' : 'Descargar XML'}
          </Button>
        )}
      </Stack>

      <Alert severity="info">
        Este XML nunca se envía automáticamente al SAT. Una vez generado, descárgalo y súbelo
        manualmente al portal SPPLD; después registra el acuse.
      </Alert>
    </Box>
  );
}
