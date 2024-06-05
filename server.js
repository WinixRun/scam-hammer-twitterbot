require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');

// Configuración de la API de Twitter
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET_KEY,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

// Configuración de Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = parseInt(process.env.TELEGRAM_CHAT_ID, 10);

// Función para enviar notificación a Telegram
const enviarNotificacionTelegram = async (mensaje) => {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
    });
  } catch (error) {
    console.error(
      'Error enviando mensaje a Telegram:',
      error.response ? error.response.data : error.message
    );
  }
};

// Configuración de MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Conectado a MongoDB');
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err);
  });

// Definir el esquema y modelo de datos de phishing
const reportSchema = new mongoose.Schema({
  enlace: String,
  telefono: String,
  aprobado: { type: Boolean, default: false },
});
const Report = mongoose.model('Report', reportSchema, 'reports');

const tokenSchema = new mongoose.Schema({
  token: String,
  reportId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, expires: '15m', default: Date.now },
});
const Token = mongoose.model('Token', tokenSchema);

// Configuración del servidor Express
const app = express();
app.use(bodyParser.json());

// Función para ofuscar enlaces
const ofuscarEnlace = (enlace) =>
  enlace.replace(/\./g, '[dot]').replace(/\//g, '[slash]');

// Escuchar cambios en la base de datos y generar un token automáticamente
Report.watch().on('change', async (change) => {
  if (change.operationType === 'insert') {
    const newReport = change.fullDocument;

    // Generar token automáticamente
    const tokenValue = crypto.randomBytes(32).toString('hex');
    const token = new Token({ token: tokenValue, reportId: newReport._id });
    await token.save();

    // Enviar enlace de aprobación a Telegram
    const enlaceOfuscado = ofuscarEnlace(newReport.enlace);
    const mensaje = `Nuevo intento de phishing detectado:\nEnlace: ${enlaceOfuscado}\nTeléfono: ${newReport.telefono}\nAprobar: https://scam-hammer.com/aprobar/${tokenValue}`;

    await enviarNotificacionTelegram(mensaje);
  }
});

// Endpoint para aprobar un phishing report
app.get('/aprobar/:token', async (req, res) => {
  try {
    const { token: tokenValue } = req.params;

    // Buscar el token en la base de datos
    const token = await Token.findOne({ token: tokenValue });
    if (!token) {
      console.error('Token not found or expired');
      return res.status(404).send('Token not found or expired');
    }

    // Buscar el reporte asociado al token
    const report = await Report.findById(token.reportId);
    if (!report) {
      console.error('Report not found');
      return res.status(404).send('Report not found');
    }

    // Marcar el reporte como aprobado y eliminar el token
    report.aprobado = true;
    await report.save();
    await Token.deleteOne({ token: tokenValue }); // Eliminar el token inmediatamente después de su uso
    res.send('Report approved');
  } catch (error) {
    console.error('Error al aprobar el reporte:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Publicar en Twitter los reportes aprobados
const publicarAprobados = async () => {
  const aprobados = await Report.find({ aprobado: true });
  for (const report of aprobados) {
    const mensaje = `🤖 Mensaje automático 
🚨 NUEVA CAMPAÑA DE PHISHING DETECTADA 🚨

Consejos: 

☎️ Bloquea el número atacante: ${report.telefono}

🔁 Retweetea para avisar a más gente.

🔨 Reporta los SMS maliciosos que te lleguen en 
https://scam-hammer.com/`;
    try {
      await twitterClient.v2.tweet(mensaje);
      console.log('Tweet publicado exitosamente');
      report.aprobado = false; // Reset para evitar republicación
      await report.save();
    } catch (error) {
      console.error('Error al publicar el tweet:', error);
    }
  }
};

// Ejecutar la función de publicación cada cierto intervalo
setInterval(publicarAprobados, 60000); // Cada 60 segundos

// Iniciar el servidor
const PORT = process.env.PORT || 7331;
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en https://scam-hammer.com:${PORT}`);
});
