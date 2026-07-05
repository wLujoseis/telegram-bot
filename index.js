const { Telegraf } = require('telegraf');
const express = require('express');
const fs = require('fs');

/* ---------------- CONFIG ---------------- */

if (!process.env.BOT_TOKEN) {
  throw new Error('Falta la variable de entorno BOT_TOKEN');
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// IDs de Telegram autorizados a usar el bot, separados por coma.
// Si se deja vacío, el bot queda abierto a cualquiera (no recomendado).
const ALLOWED_USERS = (process.env.ALLOWED_USERS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const DB_FILE = './db.json';

/* ---------------- DB (con persistencia simple en archivo) ---------------- */

let db = { reminders: [], chats: {} };

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = {
        reminders: Array.isArray(loaded.reminders) ? loaded.reminders : [],
        chats: loaded.chats && typeof loaded.chats === 'object' ? loaded.chats : {}
      };
    }
  } catch (err) {
    console.log('No se pudo cargar db.json, se usa una nueva:', err.message);
    db = { reminders: [], chats: {} };
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.log('Error guardando db.json:', err.message);
  }
}

loadDB();

/* ---------------- MEMORIA DE CONVERSACIÓN ---------------- */

function getHistory(userId) {
  if (!db.chats[userId]) db.chats[userId] = [];
  return db.chats[userId];
}

function addHistory(userId, role, text) {
  const h = getHistory(userId);
  h.push({ role, text });
  if (h.length > 10) h.shift(); // solo guardamos los últimos 10 mensajes
  saveDB();
}

function resetHistory(userId) {
  db.chats[userId] = [];
  saveDB();
}

/* ---------------- AUTORIZACIÓN ---------------- */

bot.use((ctx, next) => {
  if (ALLOWED_USERS.length === 0) return next(); // sin whitelist configurada

  const userId = String(ctx.from?.id);
  if (ALLOWED_USERS.includes(userId)) return next();

  console.log(`Acceso bloqueado para user ID ${userId}`);
  return ctx.reply('🚫 No estás autorizado a usar este bot.');
});

/* ---------------- IA CON MEMORIA ---------------- */

async function askAI(userId, message) {
  const history = getHistory(userId);

  const messages = [
    { role: 'system', content: 'Sos un asistente útil y breve dentro de un bot de Telegram.' },
    ...history.map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.text
    })),
    { role: 'user', content: message }
  ];

  try {
    const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistralai/Mistral-7B-Instruct-v0.2',
        messages
      })
    });

    const data = await res.json();
    console.log('IA RAW:', JSON.stringify(data));

    if (!res.ok) {
      return `🤖 Error IA (${res.status}): ${data?.error?.message || data?.error || 'sin detalle'}`;
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (reply) return reply;

    return '🤖 IA sin respuesta válida.';
  } catch (err) {
    console.log('IA ERROR:', err.message, '| CAUSA:', err.cause);
    return '🤖 IA caída temporalmente.';
  }
}

/* ---------------- COMANDOS (registrados ANTES del handler de texto libre) ---------------- */

bot.start(ctx => {
  ctx.reply(
    '🤖 Bot activo correctamente.\nEscribime lo que sea y te respondo con IA, o usa /ayuda para ver comandos.'
  );
});

bot.command('ayuda', ctx => {
  ctx.reply(
    [
      '📋 Comandos disponibles:',
      '/recordar <tiempo><m|h> <mensaje> — ej: /recordar 10m tomar agua',
      '/listar — ver tus recordatorios',
      '/borrar <numero> — borra un recordatorio puntual',
      '/borrar todo — borra todos tus recordatorios',
      '/reset — borra la memoria de la conversación con la IA',
      'Cualquier otro texto se responde con IA.'
    ].join('\n')
  );
});

bot.command('reset', ctx => {
  resetHistory(ctx.from.id);
  ctx.reply('🧹 Memoria de la conversación borrada.');
});

bot.command('recordar', ctx => {
  const text = ctx.message.text.replace('/recordar', '').trim();
  const match = text.match(/^(\d+)(m|h)\s(.+)$/);

  if (!match) {
    return ctx.reply('❌ Usa: /recordar 10m mensaje');
  }

  const cantidad = Number(match[1]);
  const ms = match[2] === 'm' ? cantidad * 60000 : cantidad * 3600000;

  db.reminders.push({
    user: ctx.from.id,
    message: match[3],
    time: Date.now() + ms
  });
  saveDB();

  ctx.reply('⏰ Recordatorio creado');
});

bot.command('listar', ctx => {
  const list = db.reminders.filter(r => r.user === ctx.from.id);

  if (!list.length) {
    return ctx.reply('No tienes recordatorios');
  }

  ctx.reply(list.map((r, i) => `${i + 1}. ${r.message}`).join('\n'));
});

bot.command('borrar', ctx => {
  const arg = ctx.message.text.replace('/borrar', '').trim();
  const misRecordatorios = db.reminders.filter(r => r.user === ctx.from.id);

  if (!arg || arg === 'todo') {
    db.reminders = db.reminders.filter(r => r.user !== ctx.from.id);
    saveDB();
    return ctx.reply('🗑️ Todos tus recordatorios fueron eliminados');
  }

  const index = Number(arg) - 1;
  const objetivo = misRecordatorios[index];

  if (!objetivo) {
    return ctx.reply('❌ Número inválido. Usa /listar para ver los índices.');
  }

  db.reminders = db.reminders.filter(r => r !== objetivo);
  saveDB();
  ctx.reply(`🗑️ Recordatorio "${objetivo.message}" eliminado`);
});

/* ---------------- TEXTO LIBRE -> IA (va DESPUÉS de los comandos) ---------------- */

bot.on('text', async ctx => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text.startsWith('/')) return; // comando no reconocido, lo ignoramos

  addHistory(userId, 'user', text);

  await ctx.sendChatAction('typing');

  const reply = await askAI(userId, text);

  addHistory(userId, 'assistant', reply);

  ctx.reply(reply);
});

/* ---------------- LOOP DE RECORDATORIOS ---------------- */

setInterval(() => {
  const now = Date.now();
  const pendientes = [];

  db.reminders.forEach(r => {
    if (now >= r.time) {
      bot.telegram.sendMessage(r.user, `🔔 ${r.message}`).catch(err => {
        console.log('Error enviando recordatorio:', err.message);
      });
    } else {
      pendientes.push(r);
    }
  });

  if (pendientes.length !== db.reminders.length) {
    db.reminders = pendientes;
    saveDB();
  }
}, 5000);

/* ---------------- WEB (mantiene el proceso vivo en hostings tipo Render) ---------------- */

app.get('/', (req, res) => {
  res.send('🤖 Bot funcionando correctamente');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('🌐 Web activa');
});

/* ---------------- START ---------------- */

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch({ dropPendingUpdates: true });

console.log('🤖 BOT PRO ACTIVO');
