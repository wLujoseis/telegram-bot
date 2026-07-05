const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

/* ---------------- DB ---------------- */

const DB_FILE = './db.json';

let db = {
  reminders: [],
  messages: [],
  chats: {}
};

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.log("⚠️ DB reiniciada");
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.log("⚠️ Error guardando DB");
  }
}

/* ---------------- MEMORIA ---------------- */

function getHistory(userId) {
  if (!db.chats[userId]) db.chats[userId] = [];
  return db.chats[userId];
}

function addHistory(userId, role, text) {
  const h = getHistory(userId);
  h.push({ role, text });
  if (h.length > 10) h.shift();
  saveDB();
}

/* ---------------- IA SEGURA ---------------- */

async function askAI(userId, message) {
  try {
    const history = getHistory(userId);

    let prompt = "";

    history.forEach(h => {
      prompt += `${h.role === "user" ? "Usuario" : "Asistente"}: ${h.text}\n`;
    });

    prompt += `Usuario: ${message}\nAsistente:`;

    const res = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prompt
        })
      }
    );

    const data = await res.json();

    let output = "";

    if (Array.isArray(data)) {
      output = data[0]?.generated_text;
    } else {
      output = data?.generated_text;
    }

    if (!output) {
      console.log("IA RAW:", data);
      return "🤖 No pude generar respuesta ahora.";
    }

    return output;

  } catch (err) {
    console.log("IA ERROR:", err.message);
    return "🤖 IA no disponible ahora, intenta otra vez.";
  }
}

/* ---------------- BOT ---------------- */

bot.start((ctx) => {
  ctx.reply("🤖 Bot activo y funcionando");
});

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

  if (!match) return ctx.reply("❌ Usa: /recordar 10m mensaje");

  const ms = match[2] === 'm'
    ? match[1] * 60000
    : match[1] * 3600000;

  db.reminders.push({
    user: ctx.from.id,
    message: match[3],
    time: Date.now() + ms
  });

  saveDB();

  ctx.reply("⏰ Recordatorio creado");
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

/* ---------------- WEB ---------------- */

app.get('/', (req, res) => {
  res.send("🤖 Bot funcionando");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web activa");
});

/* ---------------- START SEGURO ---------------- */

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch({ dropPendingUpdates: true });

console.log("🤖 BOT PRO ESTABLE ACTIVO");