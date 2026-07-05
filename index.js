const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

let db = { messages: [], reminders: [] };

/* ---------------- CONFIG ---------------- */

const allowedUsers = [1335034075];

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
    console.log("⚠️ DB corrupta, reiniciando...");
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

/* ---------------- BOT ---------------- */

bot.start((ctx) => {
  ctx.reply("🤖 Asistente activo\nUsa /ayuda");
});

bot.command('ayuda', (ctx) => {
  ctx.reply(`
📌 COMANDOS:

/recordar 10m mensaje
/recordar 1h mensaje
/listar
/borrar
/info
  `);
});

bot.command('info', (ctx) => {
  ctx.reply("🤖 Asistente personal con recordatorios y panel web.");
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

  let ms = type === 'm' ? value * 60000 : value * 3600000;

  db.reminders.push({
    user: ctx.from.id,
    message,
    time: Date.now() + ms
  });

  saveDB();

  ctx.reply(`⏰ Recordatorio creado: ${message}`);
});

/* ---------------- LISTAR ---------------- */

bot.command('listar', (ctx) => {
  const list = db.reminders.filter(r => r.user === ctx.from.id);

  if (list.length === 0) {
    return ctx.reply("No tienes recordatorios.");
  }

  let msg = "📋 Tus recordatorios:\n\n";

  list.forEach((r, i) => {
    msg += `${i + 1}. ${r.message}\n`;
  });

  ctx.reply(msg);
});

/* ---------------- BORRAR ---------------- */

bot.command('borrar', (ctx) => {
  db.reminders = db.reminders.filter(r => r.user !== ctx.from.id);
  saveDB();

  ctx.reply("🗑️ Recordatorios eliminados");
});

/* ---------------- MENSAJES SIN RUIDO ---------------- */

bot.on('text', (ctx) => {
  const text = ctx.message.text;

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

  if (lower.includes('qué hora')) {
    return ctx.reply(`⏰ ${new Date().toLocaleTimeString()}`);
  }

  if (lower.includes('qué puedes hacer')) {
    return ctx.reply("Puedo ayudarte, recordar cosas y responderte.");
  }

  ctx.reply("🤖 Usa /ayuda para ver comandos");
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
    <h1>🤖 Panel del Bot</h1>
    <p>📨 Mensajes: ${db.messages.length}</p>
    <p>⏰ Recordatorios: ${db.reminders.length}</p>

    <hr>

    <p><a href="/messages">Ver mensajes</a></p>
    <p><a href="/reminders">Ver recordatorios</a></p>
  `);
});

app.get('/messages', (req, res) => {
  res.json(db.messages || []);
});

app.get('/reminders', (req, res) => {
  res.json(db.reminders || []);
});

/* ---------------- START ---------------- */

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Panel web activo");
});

bot.launch();
console.log("🤖 Bot activo correctamente");