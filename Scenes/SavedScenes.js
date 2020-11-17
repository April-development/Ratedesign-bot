const { Scene } = require("./Scenes");

new class SavedScene extends Scene {
  constructor() {
    super("Saved");
    super.struct = {
      enter: [[this.enter]],
      on: [["text", this.main]],
    };
  }

  async enter(ctx) {
    const { message_id, chat } = await ctx.reply("Сохраненные");
    ctx.session.caption = [chat.id, message_id];
    //  Получение объекта пользователя из базы
    const saved = (await ctx.base.getUser(ctx.from.id)).saved;
    //  Индексация кеша
    ctx.session.cache = {
      empty: "Вы пока не сохранили не одну работу.\nДля сохранения работы откройте её и нажмите кнопку \"Сохранить\"",
      for: "просмотра",
    };
    ctx.user.indexed(ctx, saved);
    //  Отправка пользователю работ
    ctx.session.cache.responsedMessageCounter = await ctx.user.sendPage(ctx);
  }

  async main(ctx) {
    const user = ctx.user,
      cache = ctx.session.cache;
    let index = -1;
    
    if ((index = ["1⃣", "2⃣", "3⃣", "4⃣"].indexOf(ctx.message.text)) != -1) {
      cache.indexWork = index;
      cache.array = ctx.session.works;
      if (!cache.array[cache.indexWork]) {
        await ctx.reply("Работы с таким номером не существует, попробуйте заново.");
        await user.checkDos(ctx, user.deleteLastNMessage);
        cache.responsedMessageCounter += 2;
      } else {
        await user.updateWith(ctx, user.sendWork);
      }
      return;
    }
    
    switch (ctx.message.text) {
    case "⏩ Следующая страница":
      await user.updateWith(user.shiftIndex(ctx, -1), user.sendPage);
      break;
    case "⏪ Предыдущая страница":
      await user.updateWith(user.shiftIndex(ctx, 1), user.sendPage);
      break;
    case "⬅ Назад":
      switch (cache.status) {
      case "many":
        await user.goMain(ctx);
        break;
      case "one":    
        await user.updateWith(ctx, user.sendPage);
        break;
      }
      break;
    default:
      cache.responsedMessageCounter++;
    }
  }
};
