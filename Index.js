const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply('Hola 👋 soy tu bot');
});

bot.on('text', (ctx) => {
  ctx.reply(ctx.message.text);
});

bot.launch();

console.log("Bot activo");
