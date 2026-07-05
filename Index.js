const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// inicio
bot.start((ctx) => {
  ctx.reply('Hola 👋 soy tu bot en Railway');
});

// responder mensajes
bot.on('text', (ctx) => {
  ctx.reply(`Recibí: ${ctx.message.text}`);
});

bot.launch();

console.log("Bot activo...");
