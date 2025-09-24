const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');


const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // O ajusta a tu dominio frontend
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Guardar instancia global
app.set('io', io);

// Escuchar conexión
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado');

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado');
  });
});

const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env.development';

dotenv.config({ path: path.resolve(__dirname, envFile) });

// Al inicio

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB conectado correctamente'))
.catch(err => console.error('❌ Error al conectar MongoDB:', err));



app.use(express.json());
app.use(cors());

app.use('/api/auth', authRoutes);

// Usar rutas
app.use('/api/abogados', require('./routes/abogado'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/salas', require('./routes/salas'));
app.use('/api/Protocolito', require('./routes/Protocolito'));


app.get('/', (req, res) => {
  res.send('🚀 Servidor de Notaría corriendo correctamente');
});

const PORT = process.env.PORT || 8010;
const HOST = process.env.HOST || '0.0.0.0';  // Puedes usar '0.0.0.0' si quieres abrir en LAN

server.listen(PORT, HOST, () => {
  console.log(`✅ Backend corriendo en http://${HOST}:${PORT}`);
});



