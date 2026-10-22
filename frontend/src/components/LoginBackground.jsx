// src/components/LoginBackground.jsx
// Fondo del login: el MISMO efecto de aurora + partículas doradas del
// splash (src/webgl/auroraBackground.js), con las ondas de agua del mouse
// sumadas encima en el mismo pase de fondo.
import React, { useEffect, useRef } from 'react';
import {
  FULLSCREEN_VERTEX_SRC,
  AURORA_COLOR_GLSL,
  PARTICLE_COUNT,
  PARTICLE_VS,
  PARTICLE_FS,
  linkProgram,
  createParticleSeedBuffer,
} from '../webgl/auroraBackground';

const MAX_RIPPLES = 28;

const FRAGMENT_SRC = `
precision highp float;
${AURORA_COLOR_GLSL}
uniform vec2 u_ripples[${MAX_RIPPLES}];
uniform float u_rippleTimes[${MAX_RIPPLES}];
uniform float u_rippleStrength[${MAX_RIPPLES}]; // 1.0 = movimiento, 2.2 = clic

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec3 col = auroraColor(uv);

  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float total = 0.0;

  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    float age = u_time - u_rippleTimes[i];
    if (age < 0.0 || age > 1.8) continue;

    vec2 origin = vec2(u_ripples[i].x * aspect, u_ripples[i].y);
    float dist = length(p - origin);

    // Onda de agua real: un frente que avanza (age*speed) con varias
    // crestas detrás de sí (sin), amortiguadas por tiempo y distancia —
    // así salen 2-3 anillos concéntricos suaves por gota, no un radar.
    float front = age * 0.62;
    float wave = sin((dist - front) * 34.0) * 0.5 + 0.5;
    float timeDecay = exp(-age * 2.6);
    float distDecay = exp(-dist * 2.3);
    float edge = smoothstep(0.0, 0.05, front - dist);

    float ring = wave * timeDecay * distDecay * edge * u_rippleStrength[i];
    total += ring;
  }

  total = 1.0 - exp(-total * 1.4);
  col += total * vec3(0.55, 0.78, 1.0) * 0.85;

  gl_FragColor = vec4(col, 1.0);
}
`;

function startWebGL(canvas) {
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return null;

  const bgProgram = linkProgram(gl, FULLSCREEN_VERTEX_SRC, FRAGMENT_SRC);
  const particleProgram = linkProgram(gl, PARTICLE_VS, PARTICLE_FS);
  if (!bgProgram) return null;

  // --- fondo (aurora + ondas): triángulo gigante ---
  const bgBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const bgPosLoc = gl.getAttribLocation(bgProgram, 'a_position');
  const resLoc = gl.getUniformLocation(bgProgram, 'u_resolution');
  const timeLoc = gl.getUniformLocation(bgProgram, 'u_time');
  const ripplesLoc = gl.getUniformLocation(bgProgram, 'u_ripples');
  const rippleTimesLoc = gl.getUniformLocation(bgProgram, 'u_rippleTimes');
  const rippleStrengthLoc = gl.getUniformLocation(bgProgram, 'u_rippleStrength');

  // --- partículas (mismas que el splash) ---
  let particlePosLoc = -1, particleTimeLoc = null, particleBuf = null;
  if (particleProgram) {
    particleBuf = createParticleSeedBuffer(gl);
    particlePosLoc = gl.getAttribLocation(particleProgram, 'a_seed');
    particleTimeLoc = gl.getUniformLocation(particleProgram, 'u_time');
  }

  // Buffer circular de ondas: posición (UV 0..1, Y hacia arriba) + hora de
  // inicio + "fuerza" (más grande/brillante en clic que al solo pasar).
  const ripplePositions = new Float32Array(MAX_RIPPLES * 2);
  const rippleTimes = new Float32Array(MAX_RIPPLES).fill(-1000);
  const rippleStrength = new Float32Array(MAX_RIPPLES).fill(1.0);
  let nextSlot = 0;
  const start = performance.now();
  const now = () => (performance.now() - start) / 1000;

  function pushRipple(clientX, clientY, strength) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1.0 - (clientY - rect.top) / rect.height;
    const i = nextSlot;
    ripplePositions[i * 2] = x;
    ripplePositions[i * 2 + 1] = y;
    rippleTimes[i] = now();
    rippleStrength[i] = strength;
    nextSlot = (nextSlot + 1) % MAX_RIPPLES;
  }

  let lastMove = 0;
  function onMove(e) {
    const t = now();
    if (t - lastMove < 0.14) return; // throttle: una onda cada ~140ms
    lastMove = t;
    pushRipple(e.clientX, e.clientY, 0.6);
  }
  function onClick(e) {
    pushRipple(e.clientX, e.clientY, 2.2);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('click', onClick);

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

  let raf = null;
  function frame() {
    resize();
    const t = now();

    gl.disable(gl.BLEND);
    gl.useProgram(bgProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    gl.enableVertexAttribArray(bgPosLoc);
    gl.vertexAttribPointer(bgPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resLoc, canvas.width, canvas.height);
    gl.uniform1f(timeLoc, t);
    gl.uniform2fv(ripplesLoc, ripplePositions);
    gl.uniform1fv(rippleTimesLoc, rippleTimes);
    gl.uniform1fv(rippleStrengthLoc, rippleStrength);
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
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('click', onClick);
    // ⚠️ A propósito NO se llama a loseContext() aquí. React (modo
    // desarrollo / StrictMode) monta -> limpia -> vuelve a montar este
    // efecto una vez, sincrónicamente. Si se destruye el contexto WebGL en
    // la limpieza, el segundo montaje reutiliza el mismo <canvas> (un
    // canvas conserva su contexto una vez creado) y getContext() regresa
    // ese contexto ya muerto — nada se vuelve a dibujar y se queda en
    // blanco.
  };
}

export default function LoginBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cleanup = canvas ? startWebGL(canvas) : null;
    return () => { if (cleanup) cleanup(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
}
