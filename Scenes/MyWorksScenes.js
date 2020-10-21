const { Scene } = require("./Scenes");

new (class MyWorksScene extends Scene {
  constructor() {
    super("MyWorks");
    super.struct = {
      enter: [[this.enter]],
      on: [["text", this.main]],
    };
  }

  async enter(ctx) {
    const { message_id, chat } = await ctx.reply("🏆 Оценки моих работ");
    ctx.session.caption = [chat.id, message_id];
    const posted = (await ctx.base.getUser(ctx.from.id)).posted;
    //  Индексация кеша
    ctx.session.cache = {
      for: "просмотра оценки",
    };
    ctx.user.indexed(ctx, posted);
    ctx.session.cache.responsedMessageCounter = await ctx.user.sendPage(ctx);
  }

  async main(ctx) {
    const user = ctx.user,
      cache = ctx.session.cache;
    let index = -1;
    
    if ((index = ["1⃣", "2⃣", "3⃣", "4⃣"].indexOf(ctx.message.text)) != -1) {
      cache.indexWork = index;
      [cache.array, ctx.session.works] = [ctx.session.works, cache.array];
      if (!cache.array[cache.indexWork]) {
        await ctx.reply("Работы с таким номером не существует, попробуйте заново.");
        await user.checkDos(ctx, user.deleteLastNMessage);
        cache.responsedMessageCounter += 2;
      } else {
        cache.status = "one";
        await user.updateWith(ctx, user.sendWork);
      }
      [cache.array, ctx.session.works] = [ctx.session.works, cache.array];
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
      if (cache.status === "many")
      {
        cache.status = undefined;
        await ctx.user.goMain(ctx);
      } else {
        await user.updateWith(ctx, user.sendPage);
      }
      break;
    default:
      cache.responsedMessageCounter++;
    }
  }
})();
