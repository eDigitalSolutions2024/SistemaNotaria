const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

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

// 2) CORS (una sola vez, sin app.options('*', ...))
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
// Si quieres forzar preflight manual (opcional):
app.use((req, res, next) => {
  // Permite credenciales y headers/verbs
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Refleja origen permitido
  const o = req.headers.origin;
  if (o && corsOptions.origin.includes(o)) res.header('Access-Control-Allow-Origin', o);
  else res.header('Access-Control-Allow-Origin', corsOptions.origin[0]);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 3) Socket.io (alineado con CORS)
const socketIo = require('socket.io');
const io = socketIo(server, { cors: { origin: corsOptions.origin, methods: ['GET','POST'] }});
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
