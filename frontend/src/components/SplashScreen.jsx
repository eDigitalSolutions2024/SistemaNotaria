// src/components/SplashScreen.jsx
// Pantalla de bienvenida: fondo WebGL de "aurora" con colores en movimiento
// (navy -> azul -> dorado -> un toque violeta) + un campo de partículas
// doradas flotando. Los shaders viven en src/webgl/auroraBackground.js para
// que el login use exactamente el mismo fondo.
import React, { useEffect, useRef, useState } from 'react';
import {
  FULLSCREEN_VERTEX_SRC,
  AURORA_COLOR_GLSL,
  PARTICLE_COUNT,
  PARTICLE_VS,
  PARTICLE_FS,
  linkProgram,
  createParticleSeedBuffer,
} from '../webgl/auroraBackground';

const logo = '/logo.png';

const FRAGMENT_SRC = `
precision highp float;
${AURORA_COLOR_GLSL}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  gl_FragColor = vec4(auroraColor(uv), 1.0);
}
`;

function startWebGL(canvas) {
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return null;

  const auroraProgram = linkProgram(gl, FULLSCREEN_VERTEX_SRC, FRAGMENT_SRC);
  const particleProgram = linkProgram(gl, PARTICLE_VS, PARTICLE_FS);
  if (!auroraProgram) return null;

  // --- fondo: triángulo gigante ---
  const auroraBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, auroraBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const auroraPosLoc = gl.getAttribLocation(auroraProgram, 'a_position');
  const auroraResLoc = gl.getUniformLocation(auroraProgram, 'u_resolution');
  const auroraTimeLoc = gl.getUniformLocation(auroraProgram, 'u_time');

  // --- partículas ---
  let particlePosLoc = -1, particleTimeLoc = null, particleBuf = null;
  if (particleProgram) {
    particleBuf = createParticleSeedBuffer(gl);
    particlePosLoc = gl.getAttribLocation(particleProgram, 'a_seed');
    particleTimeLoc = gl.getUniformLocation(particleProgram, 'u_time');
  }

  let raf = null;
  const start = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function frame(now) {
    resize();
    const t = (now - start) / 1000;

    gl.disable(gl.BLEND);
    gl.useProgram(auroraProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, auroraBuf);
    gl.enableVertexAttribArray(auroraPosLoc);
    gl.vertexAttribPointer(auroraPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(auroraResLoc, canvas.width, canvas.height);
    gl.uniform1f(auroraTimeLoc, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (particleProgram) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // aditivo: se ven como luz
      gl.useProgram(particleProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
      gl.enableVertexAttribArray(particlePosLoc);
      gl.vertexAttribPointer(particlePosLoc, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(particleTimeLoc, t);
      gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
    }

    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    // ⚠️ A propósito NO se destruye el contexto WebGL aquí — ver el mismo
    // comentario en LoginBackground.jsx (StrictMode monta/limpia/remonta una
    // vez en desarrollo; destruir el contexto en la limpieza deja el
    // segundo montaje con un canvas "muerto").
  };
}

export default function SplashScreen({ onFinish, duration = 3000 }) {
  const canvasRef = useRef(null);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const cleanup = canvasRef.current ? startWebGL(canvasRef.current) : null;
    return () => { if (cleanup) cleanup(); };
  }, []);

  useEffect(() => {
    const fadeMs = 550;
    const outTimer = setTimeout(() => setFadingOut(true), Math.max(0, duration - fadeMs));
    const doneTimer = setTimeout(() => onFinish && onFinish(), duration);
    return () => { clearTimeout(outTimer); clearTimeout(doneTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        overflow: 'hidden',
        background: '#0f172a',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 550ms ease',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          animation: 'splash-fade-in 900ms ease both',
        }}
      >
        <style>{`
          @keyframes splash-fade-in {
            0% { opacity: 0; transform: translateY(14px) scale(0.95); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes splash-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(212, 175, 88, 0.45), 0 0 40px 6px rgba(212,175,88,0.18); }
            50% { box-shadow: 0 0 0 22px rgba(212, 175, 88, 0), 0 0 60px 14px rgba(212,175,88,0.3); }
          }
          @keyframes splash-ring {
            0% { transform: scale(0.85); opacity: 0.55; }
            100% { transform: scale(1.5); opacity: 0; }
          }
        `}</style>

        <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1px solid rgba(212,175,88,0.55)',
            animation: 'splash-ring 2.4s ease-out infinite',
          }} />
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1px solid rgba(212,175,88,0.4)',
            animation: 'splash-ring 2.4s ease-out 1.2s infinite',
          }} />
          <div
            style={{
              width: 132,
              height: 132,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'splash-pulse 2.2s ease-in-out infinite',
            }}
          >
            <img src={logo} alt="Notaría 17" style={{ width: 96, height: 96, objectFit: 'contain' }} />
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: 0.5, textShadow: '0 2px 18px rgba(212,175,88,0.35)' }}>
            Notaría Pública No. 17
          </div>
          <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 5, letterSpacing: 0.6 }}>
            Ciudad Juárez, Chihuahua
          </div>
        </div>
      </div>
    </div>
  );
}
