// src/webgl/auroraBackground.js
// Shaders compartidos entre SplashScreen y el fondo del login, para que se
// vean exactamente igual (mismo "aurora" navy/azul/dorado/violeta + campo
// de partículas doradas). auroraColor(uv) es una función GLSL reutilizable
// — quien la use declara su propio main() y puede sumarle efectos extra
// (el login le suma las ondas de agua del mouse encima).

export const FULLSCREEN_VERTEX_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// fBm de ruido valor (Inigo Quilez) animado + paleta que rota en el tiempo.
// Declara u_resolution/u_time — quien use este snippet NO debe volver a
// declararlos (duplicado = error de compilación).
export const AURORA_COLOR_GLSL = `
uniform vec2 u_resolution;
uniform float u_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 pp = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(pp - K.xxx, 0.0, 1.0), c.y);
}

vec3 auroraColor(vec2 uv) {
  vec2 p = uv * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  float t = u_time * 0.22;

  vec2 q = vec2(fbm(p + t * 0.9), fbm(p + vec2(5.2, 1.3) - t * 0.7));
  vec2 r = vec2(
    fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.5),
    fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.4)
  );
  float field = fbm(p + 2.5 * r);

  float hueShift = sin(u_time * 0.18) * 0.5 + 0.5;
  float baseHue = mix(0.60, 0.80, hueShift);
  vec3 deep = hsv2rgb(vec3(baseHue, 0.55, 0.10));
  vec3 mid  = hsv2rgb(vec3(baseHue - 0.05, 0.65, 0.32));
  vec3 glowCol = hsv2rgb(vec3(0.11, 0.70, 1.0));

  vec3 col = mix(deep, mid, clamp(field * 1.3, 0.0, 1.0));

  float goldGlow = smoothstep(0.55, 0.92, r.x + r.y * 0.5);
  col = mix(col, glowCol, goldGlow * 0.5);

  float sparkle = smoothstep(0.965, 1.0, noise(p * 9.0 + t * 3.0));
  col += sparkle * vec3(1.0, 0.92, 0.65) * 1.4;

  float d = distance(uv, vec2(0.5));
  float pulse = smoothstep(0.55, 0.0, d) * (0.5 + 0.5 * sin(u_time * 1.4));
  col += pulse * glowCol * 0.18;

  float vig = smoothstep(1.1, 0.2, d);
  col *= mix(0.6, 1.08, vig);

  return col;
}
`;

// Partículas doradas flotando (gl.POINTS). El movimiento vive entero en el
// vertex shader a partir de una "semilla" fija por partícula.
export const PARTICLE_COUNT = 140;

export const PARTICLE_VS = `
attribute vec3 a_seed; // x,y: posición base 0..1 ; z: fase/velocidad/tamaño
uniform float u_time;
varying float v_alpha;
varying float v_seed;

void main() {
  float speed = 0.05 + a_seed.z * 0.10;
  float driftX = sin(u_time * (0.3 + a_seed.z) + a_seed.x * 40.0) * 0.05;

  float y = mod(1.0 - a_seed.y - u_time * speed, 1.0);
  float x = mod(a_seed.x + driftX, 1.0);

  vec2 pos = vec2(x, y) * 2.0 - 1.0;
  gl_Position = vec4(pos, 0.0, 1.0);

  float twinkle = 0.5 + 0.5 * sin(u_time * (1.5 + a_seed.z * 3.0) + a_seed.x * 20.0);
  v_alpha = twinkle;
  v_seed = a_seed.z;
  gl_PointSize = mix(1.5, 4.5, a_seed.z) * (0.6 + 0.4 * twinkle);
}
`;

export const PARTICLE_FS = `
precision mediump float;
varying float v_alpha;
varying float v_seed;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);
  vec3 gold = mix(vec3(1.0, 0.95, 0.75), vec3(0.85, 0.70, 0.35), v_seed);
  gl_FragColor = vec4(gold, soft * v_alpha * 0.85);
}
`;

export function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[webgl] shader error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function linkProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[webgl] link error:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

// Crea y sube el buffer de semillas de partículas — compartido entre splash
// y login para que ambos tengan el mismo campo de puntos.
export function createParticleSeedBuffer(gl) {
  const seeds = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    seeds[i * 3 + 0] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    seeds[i * 3 + 2] = Math.random();
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  return buf;
}
