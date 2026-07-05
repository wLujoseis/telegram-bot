const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

/* ---------------- CONFIG ---------------- */

// 🔒 TU ID
const allowedUsers = [1335034075];

// 📁 DB
const DB_FILE = './db.json';

let db = {
  reminders: [],
  messages: []
};

// cargar DB si existe
if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE));
  } catch (e) {
    console.log("Error leyendo DB, reiniciando...");
  }
}

// guardar DB
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* ---------------- SEGURIDAD ---------------- */

bot.use((ctx, next) => {
  if (!ctx.from) return;
  if (!allowedUsers.includes(ctx.from.id)) {
    return ctx.reply("❌ No autorizado");
  }
  return next();
});

/* ---------------- COMANDOS ---------------- */

bot.start((ctx) => {
  ctx.reply("🤖 Asistente activo\nUsa /ayuda");
});

bot.command('ayuda', (ctx) => {
  ctx.reply(`
📌 Comandos:
/recordar 10m mensaje
/recordar 1h mensaje
  `);
});

/* ---------------- RECORDATORIOS ---------------- */

bot.command('recordar', (ctx) => {
  const text = ctx.message.text.replace('/recordar', '').trim();

  const match = text.match(/^(\d+)(m|h)\s(.+)$/);

  if (!match) {
    return ctx.reply("❌ Usa: /recordar 10m tomar agua");
  }

  const value = parseInt(match[1]);
  const type = match[2];
  const message = match[3];

  let ms = 0;
  if (type === 'm') ms = value * 60000;
  if (type === 'h') ms = value * 3600000;

  db.reminders.push({
    user: ctx.from.id,
    message,
    time: Date.now() + ms
  });

  saveDB();

  ctx.reply(`⏰ Recordatorio creado: ${message}`);
});

/* ---------------- MENSAJES (SIN BUG "RECIBIDO") ---------------- */

bot.on('text', (ctx) => {
  const text = ctx.message.text;

  // 🔥 evitar comandos
  if (text.startsWith('/')) return;

  const lower = text.toLowerCase();

  db.messages.push({
    user: ctx.from.id,
    text,
    date: new Date()
  });

  saveDB();

  if (lower.includes('hola')) {
    return ctx.reply("👋 Hola, soy tu asistente.");
  }

  if (lower.includes('quién eres')) {
    return ctx.reply("🤖 Soy tu asistente personal.");
  }

  if (lower.includes('ayuda')) {
    return ctx.reply("Escribe /ayuda para ver comandos.");
  }

  ctx.reply("🤖 No entendí eso, usa /ayuda");
});

/* ---------------- RECORDATORIOS AUTOMÁTICOS ---------------- */

setInterval(() => {
  const now = Date.now();

  db.reminders = db.reminders.filter(r => {
    if (now >= r.time) {
      bot.telegram.sendMessage(r.user, `🔔 Recordatorio: ${r.message}`);
      return false;
    }
    return true;
  });

  saveDB();
}, 5000);

/* ---------------- PANEL WEB ---------------- */

app.get('/', (req, res) => {
  res.send(`
    <h1>🤖 Panel del Asistente</h1>
    <p>Mensajes: ${db.messages.length}</p>
    <p>Recordatorios: ${db.reminders.length}</p>
  `);
});

app.get('/messages', (req, res) => {
  res.json(db.messages);
});

app.get('/reminders', (req, res) => {
  res.json(db.reminders);
});

/* ---------------- START ---------------- */

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Panel web activo");
});

bot.launch();
console.log("🤖 Bot activo correctamente");