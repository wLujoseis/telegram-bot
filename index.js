const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

/* ---------------- CONFIG ---------------- */

const allowedUsers = [1335034075];

const DB_FILE = './db.json';

let db = { reminders: [] };

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE));
  } catch (e) {
    db = { reminders: [] };
  }
}

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

/* ---------------- START ---------------- */

bot.start((ctx) => {
  ctx.reply("🤖 Asistente activo\nEscribe lo que quieras o usa /ayuda");
});

/* ---------------- COMANDOS ---------------- */

bot.command('ayuda', (ctx) => {
  ctx.reply(`
📌 COMANDOS:
/recordar 10m mensaje
/listar
/borrar
/info
  `);
});

bot.command('info', (ctx) => {
  ctx.reply("🤖 Soy tu asistente inteligente con memoria y recordatorios.");
});

/* ---------------- RECORDATORIOS ---------------- */

bot.command('recordar', (ctx) => {
  const text = ctx.message.text.replace('/recordar', '').trim();

  const match = text.match(/^(\d+)(m|h)\s(.+)$/);

  if (!match) {
    return ctx.reply("❌ Usa: 10m tomar agua");
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

  ctx.reply(`⏰ Listo, lo recordaré`);
});

/* ---------------- LISTAR ---------------- */

bot.command('listar', (ctx) => {
  const list = db.reminders.filter(r => r.user === ctx.from.id);

  if (list.length === 0) {
    return ctx.reply("No tienes recordatorios.");
  }

  let msg = "📋 Recordatorios:\n\n";
  list.forEach((r, i) => {
    msg += `${i + 1}. ${r.message}\n`;
  });

  ctx.reply(msg);
});

/* ---------------- BORRAR ---------------- */

bot.command('borrar', (ctx) => {
  db.reminders = db.reminders.filter(r => r.user !== ctx.from.id);
  saveDB();
  ctx.reply("🗑️ Eliminados");
});

/* ---------------- 🤖 MODO INTELIGENTE SIN COMANDOS ---------------- */

bot.on('text', (ctx) => {
  const text = ctx.message.text.toLowerCase();

  // ❌ evitar comandos
  if (text.startsWith('/')) return;

  // 💾 guardar en memoria básica
  if (text.includes('recordar')) {
    db.reminders.push({
      user: ctx.from.id,
      message: text.replace('recordar', '').trim(),
      time: Date.now() + 60000 // 1 min por defecto
    });

    saveDB();

    return ctx.reply("⏰ Ok, lo recordaré");
  }

  if (text.includes('hola')) {
    return ctx.reply("👋 Hola, dime qué necesitas");
  }

  if (text.includes('qué puedes hacer')) {
    return ctx.reply("Puedo responderte, recordar cosas y ayudarte.");
  }

  if (text.includes('hora')) {
    return ctx.reply(`⏰ ${new Date().toLocaleTimeString()}`);
  }

  ctx.reply("🤖 No estoy seguro, pero puedo ayudarte. Escribe /ayuda");
});

/* ---------------- RECORDATORIOS ---------------- */

setInterval(() => {
  const now = Date.now();

  db.reminders = db.reminders.filter(r => {
    if (now >= r.time) {
      bot.telegram.sendMessage(r.user, `🔔 ${r.message}`);
      return false;
    }
    return true;
  });

  saveDB();
}, 5000);

/* ---------------- WEB PANEL ---------------- */

app.get('/', (req, res) => {
  res.send(`
    <h1>🤖 Asistente activo</h1>
    <p>Recordatorios: ${db.reminders.length}</p>
  `);
});

app.listen(process.env.PORT || 3000);

bot.launch();
console.log("🤖 Asistente inteligente activo");