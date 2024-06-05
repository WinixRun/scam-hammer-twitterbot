require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const analyzeSite = require('./siteAnalysis');

// Configuración de la API de Twitter
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET_KEY,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
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
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
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
  pageTitle: String,
  impersonation: [String],
});
const Report = mongoose.model('Report', reportSchema, 'reports');

const tokenSchema = new mongoose.Schema({
  token: String,
  reportId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, expires: '180m', default: Date.now },
});
const Token = mongoose.model('Token', tokenSchema);

// Configuración del servidor Express
const app = express();
app.use(bodyParser.json());

// Función para ofuscar enlaces
const ofuscarEnlace = (enlace) =>
  enlace.replace(/\./g, '[dot]').replace(/\//g, '[slash]');

// Verificar nuevos reportes cada 30 segundos
setInterval(async () => {
  const nuevosReportes = await Report.find({ aprobado: false })
    .sort({ createdAt: -1 })
    .limit(1);
  if (nuevosReportes.length > 0) {
    const newReport = nuevosReportes[0];

    // Analizar la URL
    const impersonation = await analyzeSite(newReport.enlace);

    // Generar token automáticamente
    const tokenValue = crypto.randomBytes(32).toString('hex');
    const token = new Token({ token: tokenValue, reportId: newReport._id });
    await token.save();

    // Enviar enlace de aprobación a Telegram
    const enlaceOfuscado = ofuscarEnlace(newReport.enlace);
    const mensaje = `Nuevo intento de phishing detectado:\nEnlace: ${enlaceOfuscado}\nTeléfono: ${
      newReport.telefono
    }\nEntidad suplantada: ${
      impersonation.join(', ') || 'Desconocido'
    }\nAprobar: https://scam-hammer.com/aprobar/${tokenValue}`;

    await enviarNotificacionTelegram(mensaje);
  }
}, 30000); // Cada 30 segundos

// Endpoint para aprobar un phishing report
app.get('/aprobar/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const foundToken = await Token.findOne({ token });
    if (!foundToken) {
      return res.status(400).send('Token inválido o expirado');
    }

    const report = await Report.findById(foundToken.reportId);
    if (!report) {
      return res.status(400).send('Reporte no encontrado');
    }

    report.aprobado = true;
    await report.save();
    await foundToken.remove();

    // Enviar tweet
    const enlaceOfuscado = ofuscarEnlace(report.enlace);
    const mensaje = `🚨 NUEVA CAMPAÑA DE PHISHING DETECTADA 🚨\n\n🔗 Enlace: ${enlaceOfuscado}\n\nEntidad suplantada: ${
      report.impersonation.join(', ') || 'Desconocido'
    }\n\n🔁 Retweetea para avisar a más gente.\n\n🔨 Reporta los SMS maliciosos que te lleguen en https://scam-hammer.com/`;

    try {
      await twitterClient.v2.tweet(mensaje);
      console.log('Tweet publicado exitosamente');
      res.send('Reporte aprobado y tweet publicado');
    } catch (error) {
      console.error('Error al publicar el tweet:', error);
      res.status(500).send('Error al publicar el tweet');
    }
  } catch (error) {
    console.error('Error al aprobar el reporte:', error);
    res.status(500).send('Error al aprobar el reporte');
  }
});

// Iniciar el servidor
app.listen(7331, () => {
  console.log('Servidor ejecutándose en https://scam-hammer.com:7331');
});
