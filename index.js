const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply("🟢 BOT FUNCIONANDO");
});

bot.on('text', (ctx) => {
  ctx.reply("📩 OK: " + ctx.message.text);
});

bot.launch({ dropPendingUpdates: true });

console.log("BOT INICIADO");