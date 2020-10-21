// TODO: Изменилась переменная индекса работы проверить
const { Scene, Markup, Extra, InlineController } = require("./Scenes");

// TODO: Статусы перенести в кеш(автоматизировать)
async function findSavedStatus(ctx, userId, postId)
{
  let user = await ctx.base.getUser(userId);
  return user.saved.find((post)=> post._id == postId) != undefined;
}
async function findReportStatus(ctx, userId, postId)
{
  let user = await ctx.base.getUser(userId);
  return user.reports && user.reports.indexOf(postId) != -1;
}

function inlineRate(cache, postId) {
  return [
    [...Array(5).keys()].map((i) =>
      Markup.callbackButton(
        (cache.rated_status === i + 1 ? "[" : "") +
        String(i + 1) +
        (cache.rated_status === i + 1 ? "]" : ""),
        String(i + 1) + "-" + postId
      )
    ),
    [Markup.callbackButton((cache.saved_status) ? "🤘 Сохранено": "📎 Сохранить работу", "save-" + postId)],
    [Markup.callbackButton(...(cache.report_status) ? ["✅ Жалоба отправлена","nop"]: ["🚫 Пожаловаться", "report-" + postId])],
  ];
}

function inlineReport(cache, postId) {
  const reportType = ["Неприличный контент", "Плагиат", "Спам"];
  let board = [...Array(3).keys()].map((i) =>
    [Markup.callbackButton(
      reportType[i],
      String(i + 1) + "report-" + postId
    )]
  );
  board.push([Markup.callbackButton("❌ Отмена", "back-" + postId)]);
  return board;
}

async function showToRate(ctx) {
  const user = ctx.user,
    cache = ctx.session.cache,
    postId = cache.array[cache.indexWork]._id,
    rate = await ctx.base.getRate(postId);
  cache.responsedMessageCounter = await user.sendWork(ctx);
  await ctx.reply(
    (rate ? "Средняя оценка работы: " + rate.toFixed(2) + "\nОцените работу:" : "Работу ещё никто не оценил, станьте первым!"),
    Extra.HTML().markup((m) =>
      m.inlineKeyboard(inlineRate(cache, postId))
    )
  );
  cache.responsedMessageCounter++;
  return cache.responsedMessageCounter;
}

new (class RateScene extends Scene {
  constructor() {
    super("Rate");
    super.struct = {
      enter: [[this.enter]],
      action: [
        [/([1-5])-([\w\D]*)/, this.ratePost],
        [/save-([\w\D]*)/, this.savePost],
        [/([1-3])report-([\w\D]*)/, this.reportPost],
        [/report-([\w\D]*)/, this.goReports],
        [/back-([\w\D]*)/, this.goBack],
        [/nop/, this.nop],
      ],
      on: [["text", this.main]],
    };
  }

  async enter(ctx) {
    const { message_id, chat } = await ctx.reply("Оценка работ");
    ctx.session.caption = [chat.id, message_id];
      
    const user = await ctx.base.getUser(ctx.from.id);
    let cache = (ctx.session.cache = { 
      index: user.page,
      perPage: 4,
      for: "оценки",
      keyboard: ["⬅ Назад в ленту"],
    });
    if (cache.index == -1) cache.index = 0;
    cache.responsedMessageCounter = await ctx.user.sendWorksGroup(ctx);
    cache.array = ctx.session.works;
    cache.saved_status = undefined;
    cache.rated_status = undefined;
    cache.report_status = undefined;
    
    ctx.session.inlineKeyboard = new InlineController;
    ctx.session.inlineKeyboard.stage({
      Report: inlineReport,
      Rate: inlineRate,
    }).go("Rate");
  }

  async savePost(ctx) {
    const cache = ctx.session.cache,
      postId = ctx.match[1];
    cache.saved_status = true;
    await ctx.editMessageReplyMarkup({
      inline_keyboard: inlineRate(cache, postId)
    });
    await ctx.base.savePost(ctx.chat.id, postId);
    await ctx.answerCbQuery("Сохранено");
  }

  async ratePost(ctx) {
    const cache = ctx.session.cache,
      postId = ctx.match[2],
      rate = ctx.match[1];
    cache.rated_status = +rate;
    await ctx.editMessageReplyMarkup({
      inline_keyboard: inlineRate(cache, postId)
    });
    await ctx.base.putRate(ctx.from.id, postId, rate);
    await ctx.base.seenPost(ctx.from.id, postId);
    await ctx.answerCbQuery("Вы поставили " + cache.rated_status);
  }

  async goReports(ctx) {
    const postId = ctx.match[1];
    await ctx.editMessageReplyMarkup({
      inline_keyboard: ctx.session.inlineKeyboard.go("Report").now(ctx.session.cache, postId)
    });
    await ctx.answerCbQuery("");
  }

  async reportPost(ctx) {
    const cache = ctx.session.cache,
      reportId = +ctx.match[1],
      postId = ctx.match[2];
    if (cache.report_status === true) {
      await ctx.answerCbQuery("");
      return;
    } 
    cache.report_status = true;
    await ctx.base.putReport(postId, ctx.from.id, reportId);
    await ctx.base.seenPost(ctx.from.id, postId);
    await ctx.editMessageReplyMarkup({
      inline_keyboard: ctx.session.inlineKeyboard.goBack().now(cache, postId)
    }).catch(); // если не нечего менять, оно выкенет ошибку // TODO: сделать отельную функцию
    await ctx.answerCbQuery("Жалоба отправлена");
  }

  async goBack(ctx) {
    const postId = ctx.match[1];
    await ctx.editMessageReplyMarkup({
      inline_keyboard: ctx.session.inlineKeyboard.goBack().now(ctx.session.cache, postId)
    });
    await ctx.answerCbQuery("");
  }
  
  async nop(ctx) {
    await ctx.answerCbQuery("");
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
        const postId = cache.array[cache.indexWork]._id;
        cache.saved_status = await findSavedStatus(ctx, ctx.from.id, postId);
        cache.report_status = await findReportStatus(ctx, ctx.from.id, postId);
        cache.rated_status = undefined;
        cache.status = "one";
        await user.updateWith(ctx, showToRate);
      }
      [cache.array, ctx.session.works] = [ctx.session.works, cache.array];
      return;
    }

    switch (ctx.message.text) {
    case "⏩ Следующая страница":
      await user.updateWith(user.shiftIndex(ctx, 1), user.sendWorksGroup);
      break;
    case "⏪ Предыдущая страница":
      await user.updateWith(user.shiftIndex(ctx, -1), user.sendWorksGroup);
      break;
    case "⬅ Назад":
      switch (cache.status) {
      case "many":
        cache.status = undefined;
        cache.keyboard = undefined;
        ctx.session.inlineKeyboard = undefined;
        await ctx.base.putUser(ctx.from.id, { page: cache.index });
        await ctx.user.goMain(ctx);  
        break;
      case "one":
        cache.saved_status = undefined;
        cache.rated_status = undefined;
        cache.report_status = undefined;
        await user.updateWith(ctx, user.sendWorksGroup);
        break;
      }
      break;
    case "⬅ Назад в ленту":
      cache.saved_status = undefined;
      cache.rated_status = undefined;
      cache.report_status = undefined;
      await user.updateWith(ctx, user.sendWorksGroup);
      break;
    default:
      cache.responsedMessageCounter++;
    }
  }
})();
