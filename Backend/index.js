const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

const session = require('express-session');
const MongoStore = require('connect-mongo');

const authRoutes = require('./routes/auth');
const recibosRouter = require('./routes/recibos');

dotenv.config({
  path: path.resolve(__dirname, process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env.development')
});

// 1) Crear app y server primero
const app = express();
const server = http.createServer(app);

// 2) CORS (dinámico por origen)
const { URL } = require('url');

const extraOrigins = (process.env.CORS_EXTRA_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/** Acepta http/https desde localhost/127.0.0.1/::1 (cualquier puerto),
 *  redes privadas 10.x, 192.168.x, 172.16–31.x y dominios extra por .env */
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl/Postman o same-origin sin header
  try {
    const u = new URL(origin);
    if (!/^https?:$/.test(u.protocol)) return false;

    const h = u.hostname;
    // localhost (cualquier puerto)
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;

    // IPs privadas (LAN)
    if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;

    // Dominios exactos permitidos por .env (incluye esquema)
    if (extraOrigins.includes(origin)) return true;

    return false;
  } catch (_) {
    return false;
  }
}

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error(`CORS: origin no permitido -> ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Middleware de compatibilidad (mínimo cambio, ahora refleja dinámico)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const o = req.headers.origin;
  if (isAllowedOrigin(o)) res.header('Access-Control-Allow-Origin', o || '*');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 3) Socket.io (alineado con CORS dinámico)
const socketIo = require('socket.io');
const io = socketIo(server, {
  cors: {
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      cb(new Error(`CORS (socket): origin no permitido -> ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  path: '/socket.io',
});
app.set('io', io);

io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado');
  socket.on('disconnect', () => console.log('❌ Cliente desconectado'));
});


// 4) DB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB conectado correctamente'))
  .catch(err => console.error('❌ Error al conectar MongoDB:', err));

// 5) Middlewares
app.use(express.json());


app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'cambia-esto-en-env',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    // Reutiliza tu conexión ya abierta de mongoose (funciona con PM2 cluster)
    client: mongoose.connection.getClient(),
    ttl: 60 * 60,           // 1 hora (en segundos)
    autoRemove: 'interval',
    autoRemoveInterval: 10, // limpia expirados cada 10 min
  }),
  cookie: {
    httpOnly: true,
    // ⚠️ Como dices que sirves directo con PM2 (sin HTTPS/Proxy),
    // probablemente estás en HTTP: usa secure=false en producción si no hay HTTPS.
    secure: process.env.COOKIE_SECURE === 'true', // pon COOKIE_SECURE=true solo si usas HTTPS
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000, // 1 hora en el navegador
  },
  rolling: true,            // 🔑 renueva expiración por actividad (inactividad real)
}));



// 6) Rutas
app.use('/api/auth', authRoutes);
app.use('/api/abogados', require('./routes/abogado'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/salas', require('./routes/salas'));
app.use('/api/Protocolito', require('./routes/Protocolito'));
app.use('/api/recibos', recibosRouter);              // ← dropdown de protocolitos
app.use('/api/plantillas', require('./routes/plantillas'));

app.get('/', (_req, res) => res.send('🚀 Servidor de Notaría corriendo correctamente'));

// 7) Arrancar
const PORT = process.env.PORT || 8010;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`✅ Backend corriendo en http://${HOST}:${PORT}`);
});
