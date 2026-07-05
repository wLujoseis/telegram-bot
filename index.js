const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');

// si tu Node no tiene fetch:
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

/* ---------------- CONFIG ---------------- */

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const allowedUsers = [1335034075];
const DB_FILE = './db.json';

let db = {
  reminders: [],
  messages: [],
  chats: {}
};

/* ---------------- DB ---------------- */

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.log("⚠️ DB corrupta, reiniciando...");
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* ---------------- MEMORIA PRO ---------------- */

function getHistory(userId) {
  if (!db.chats[userId]) db.chats[userId] = [];
  return db.chats[userId];
}

function addHistory(userId, role, text) {
  const history = getHistory(userId);

  history.push({ role, text });

  if (history.length > 12) history.shift();

  saveDB();
}

/* ---------------- IA PRO ---------------- */

const HUGGINGFACE_API_KEY = process.env.HF_TOKEN;

async function askAI(userId, message) {
  const history = getHistory(userId);

  let prompt = "Eres un asistente inteligente, útil y conversacional.\n";

  history.forEach(h => {
    prompt += `${h.role === "user" ? "Usuario" : "Asistente"}: ${h.text}\n`;
  });

  prompt += `Usuario: ${message}\nAsistente:`;

  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 180,
            temperature: 0.7
          }
        })
      }
    );

    const data = await res.json();

    const output =
      data?.[0]?.generated_text ||
      data?.generated_text;

    if (output) {
      return output.split("Asistente:").pop().trim();
    }

    throw new Error("Sin respuesta");

  } catch (err) {
    console.log("IA error:", err.message);
    return "🤖 No pude pensar ahora mismo, intenta de nuevo.";
  }
}

/* ---------------- SEGURIDAD ---------------- */

bot.use((ctx, next) => {
  if (!ctx.from) return;
  if (!allowedUsers.includes(ctx.from.id)) {
    return ctx.reply("❌ No autorizado");
  }
  return next();
});

/* ---------------- BOT IA ---------------- */

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text.startsWith('/')) return;

  addHistory(userId, "user", text);

  await ctx.sendChatAction("typing");

  const reply = await askAI(userId, text);

  addHistory(userId, "assistant", reply);

  ctx.reply(reply);
});

/* ---------------- RECORDATORIOS ---------------- */

bot.command('recordar', (ctx) => {
  const text = ctx.message.text.replace('/recordar', '').trim();
  const match = text.match(/^(\d+)(m|h)\s(.+)$/);

  if (!match) return ctx.reply("❌ Usa: /recordar 10m tomar agua");

  const value = parseInt(match[1]);
  const type = match[2];
  const message = match[3];

  const ms = type === 'm' ? value * 60000 : value * 3600000;

  db.reminders.push({
    user: ctx.from.id,
    message,
    time: Date.now() + ms
  });

  saveDB();

  ctx.reply("⏰ Recordatorio creado");
});

bot.command('listar', (ctx) => {
  const list = db.reminders.filter(r => r.user === ctx.from.id);

  if (!list.length) return ctx.reply("No tienes recordatorios");

  ctx.reply(list.map((r, i) => `${i + 1}. ${r.message}`).join("\n"));
});

bot.command('borrar', (ctx) => {
  db.reminders = db.reminders.filter(r => r.user !== ctx.from.id);
  saveDB();
  ctx.reply("🗑️ Eliminados");
});

/* ---------------- LOOP RECORDATORIOS ---------------- */

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

/* ---------------- PANEL WEB ---------------- */

app.get('/', (req, res) => {
  res.send(`
    <h1>🤖 Bot PRO</h1>
    <p>Mensajes: ${db.messages.length}</p>
    <p>Recordatorios: ${db.reminders.length}</p>
  `);
});

app.get('/messages', (req, res) => res.json(db.messages));
app.get('/reminders', (req, res) => res.json(db.reminders));

/* ---------------- START ---------------- */

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web activa");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch();
console.log("🤖 Bot PRO activo");