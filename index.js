const { Telegraf } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

/* ---------------- DB ---------------- */

let db = {
  reminders: [],
  chats: {}
};

/* ---------------- MEMORIA ---------------- */

function getHistory(userId) {
  if (!db.chats[userId]) db.chats[userId] = [];
  return db.chats[userId];
}

function addHistory(userId, role, text) {
  const h = getHistory(userId);

  h.push({ role, text });

  if (h.length > 10) h.shift();
}

/* ---------------- IA SEGURA ---------------- */

async function askAI(message) {
  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: message
        })
      }
    );

    const data = await res.json();

    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text;
    }

    if (data?.generated_text) {
      return data.generated_text;
    }

    return "🤖 No tengo respuesta ahora.";

  } catch (err) {
    console.log("IA ERROR:", err.message);
    return "🤖 IA no disponible.";
  }
}

/* ---------------- BOT ---------------- */

bot.start((ctx) => {
  ctx.reply("🤖 Bot activo correctamente");
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text.startsWith('/')) return;

  addHistory(userId, "user", text);

  await ctx.sendChatAction("typing");

  const reply = await askAI(text);

  addHistory(userId, "assistant", reply);

  ctx.reply(reply);
});

/* ---------------- RECORDATORIOS ---------------- */

bot.command('recordar', (ctx) => {
  const text = ctx.message.text.replace('/recordar', '').trim();
  const match = text.match(/^(\d+)(m|h)\s(.+)$/);

  if (!match) {
    return ctx.reply("❌ Usa: /recordar 10m mensaje");
  }

  const ms = match[2] === 'm'
    ? match[1] * 60000
    : match[1] * 3600000;

  db.reminders.push({
    user: ctx.from.id,
    message: match[3],
    time: Date.now() + ms
  });

  ctx.reply("⏰ Recordatorio creado");
});

bot.command('listar', (ctx) => {
  const list = db.reminders.filter(r => r.user === ctx.from.id);

  if (!list.length) {
    return ctx.reply("No tienes recordatorios");
  }

  ctx.reply(list.map((r, i) => `${i + 1}. ${r.message}`).join("\n"));
});

bot.command('borrar', (ctx) => {
  db.reminders = db.reminders.filter(r => r.user !== ctx.from.id);
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
}, 5000);

/* ---------------- WEB ---------------- */

app.get('/', (req, res) => {
  res.send("🤖 Bot funcionando correctamente");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web activa");
});

/* ---------------- START ---------------- */

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch({ dropPendingUpdates: true });

console.log("🤖 BOT PRO ACTIVO");