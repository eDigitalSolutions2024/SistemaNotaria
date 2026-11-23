// frontend/src/components/anuncios/AnuncioImagenes.jsx
// Muestra las capturas adjuntas a un anuncio. Las imágenes están detrás de
// la sesión (Bearer), así que se bajan con axios como blob y se muestran con
// un object URL. Clic en una miniatura => visor a pantalla grande.
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Dialog, IconButton } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useAuth } from '../../auth/AuthContext';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8010/api';

// `llenar`: las imágenes se estiran al ancho disponible (1 sola = todo el
// ancho; varias = en columnas), limitadas por `altura`.
// `ampliar={false}`: no abre el visor propio (el clic lo maneja el contenedor).
export default function AnuncioImagenes({ anuncio, altura = 140, llenar = false, ampliar = true }) {
  const { token } = useAuth();
  const total = anuncio?.imagenes?.length || 0;
  const id = anuncio?._id;
  const [urls, setUrls] = useState([]);
  const [grande, setGrande] = useState(null);
  const authCfg = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' }),
    [token]
  );

  useEffect(() => {
    if (!total || !id) return undefined;
    let vivo = true;
    const creadas = [];
    (async () => {
      const res = await Promise.all(
        Array.from({ length: total }, (_, i) =>
          axios
            .get(`${API}/anuncios/${id}/imagenes/${i}`, authCfg)
            .then((r) => {
              const u = URL.createObjectURL(r.data);
              creadas.push(u);
              return u;
            })
            .catch(() => null)
        )
      );
      if (vivo) setUrls(res);
    })();
    return () => {
      vivo = false;
      creadas.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [id, total, authCfg]);

  if (!total) return null;

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {Array.from({ length: total }, (_, i) =>
          urls[i] ? (
            <img
              key={i}
              src={urls[i]}
              alt={`Captura ${i + 1}`}
              title={ampliar ? 'Clic para ampliar' : undefined}
              onClick={ampliar ? () => setGrande(urls[i]) : undefined}
              style={{
                maxHeight: altura,
                maxWidth: '100%',
                ...(llenar
                  ? { flex: total === 1 ? '1 1 100%' : '1 1 calc(50% - 8px)', width: total === 1 ? '100%' : undefined, objectFit: 'contain' }
                  : {}),
                borderRadius: 6,
                border: '1px solid rgba(0,0,0,.2)',
                cursor: ampliar ? 'zoom-in' : 'pointer',
                background: '#fff',
              }}
            />
          ) : (
            <div
              key={i}
              style={{
                height: 60, width: 100, borderRadius: 6, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,.08)',
              }}
            >
              {urls.length ? 'No disponible' : 'Cargando…'}
            </div>
          )
        )}
      </div>

      <Dialog open={!!grande} onClose={() => setGrande(null)} maxWidth={false}>
        <IconButton
          onClick={() => setGrande(null)}
          sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(255,255,255,.9)' }}
          size="small"
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
        {grande && (
          <img
            src={grande}
            alt="Captura ampliada"
            style={{ maxWidth: '92vw', maxHeight: '90vh', display: 'block', objectFit: 'contain' }}
          />
        )}
      </Dialog>
    </>
  );
}
