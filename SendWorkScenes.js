const Scene = require('telegraf/scenes/base');
const config = require('./congif.json');
const Telegraf = require('telegraf');
const Telegram = require('telegraf/telegram');

const bot = new Telegraf(config.token);
const telegram = new Telegram(config.token)

class sendWorkScenes {
    PhotoUploadScene(){
        const photoUpload = new Scene('photoUpload');
        photoUpload.enter(async (ctx) => {
            await ctx.reply('Отправьте фотографии в формате jpeg или png. Первая фотография будет использоваться в качестве превью к вашей работе');
        });
        photoUpload.on('photo', async (ctx) => {
            const imageData = await bot.telegram.getFile(ctx.message.photo[ctx.message.photo.length - 1].file_id);
            const link = await telegram.getFileLink(imageData.file_id);
            await ctx.replyWithPhoto({ url: link })
            //TODO: write code to push data (fileID) in database
        });
        return photoUpload;
    }
}

module.exports = sendWorkScenes;