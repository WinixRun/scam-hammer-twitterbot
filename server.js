require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const { analyzeUrl } = require('./siteAnalysis');

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
    console.log('Mensaje enviado a Telegram:', mensaje);
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

const app = express();
app.use(bodyParser.json());

const ofuscarEnlace = (enlace) =>
  enlace.replace(/\./g, '[dot]').replace(/\//g, '[slash]');

Report.watch().on('change', async (change) => {
  if (change.operationType === 'insert') {
    const newReport = change.fullDocument;

    const tokenValue = crypto.randomBytes(32).toString('hex');
    const token = new Token({ token: tokenValue, reportId: newReport._id });
    await token.save();

    console.log('Nuevo reporte insertado:', newReport);

    const entidadSuplantada = await analyzeUrl(newReport.enlace);

    const enlaceOfuscado = ofuscarEnlace(newReport.enlace);
    const mensaje = `Nuevo intento de phishing detectado:\nEnlace: ${enlaceOfuscado}\nTeléfono: ${
      newReport.telefono
    }\nEntidad suplantada: ${
      entidadSuplantada || 'Desconocida'
    }\nAprobar: https://scam-hammer.com/aprobar/${tokenValue}`;

    await enviarNotificacionTelegram(mensaje);
  }
});

app.get('/aprobar/:token', async (req, res) => {
  try {
    const { token: tokenValue } = req.params;

    const token = await Token.findOne({ token: tokenValue });
    if (!token) {
      console.error('Token not found or expired');
      return res.status(404).send('Token not found or expired');
    }

    const report = await Report.findById(token.reportId);
    if (!report) {
      console.error('Report not found');
      return res.status(404).send('Report not found');
    }

    report.aprobado = true;
    await report.save();
    await Token.deleteOne({ token: tokenValue });
    console.log('Reporte aprobado:', report);
    res.send('Report approved');
  } catch (error) {
    console.error('Error al aprobar el reporte:', error);
    res.status(500).send('Internal Server Error');
  }
});

const publicarAprobados = async () => {
  const aprobados = await Report.find({ aprobado: true });
  for (const report of aprobados) {
    const mensaje = `🚨 NUEVA CAMPAÑA DE PHISHING DETECTADA 🚨\n🔗 Enlace: ${ofuscarEnlace(
      report.enlace
    )}\nConsejos:\n☎️ Bloquea el número de teléfono.\n🔁 Retweetea para avisar a más gente.\n🔨 Reporta los SMS maliciosos que te lleguen en\nhttps://scam-hammer.com/`;
    try {
      await twitterClient.v2.tweet(mensaje);
      console.log('Tweet publicado exitosamente:', mensaje);
      report.aprobado = false;
      await report.save();
    } catch (error) {
      console.error('Error al publicar el tweet:', error);
    }
  }
};

setInterval(publicarAprobados, 60000);

// Iniciar el servidor
const PORT = process.env.PORT || 7331;
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en https://scam-hammer.com:${PORT}`);
});
