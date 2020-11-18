// TODO: Изменилась переменная индекса работы проверить
const { Scene, Markup, Extra, InlineController } = require("./Scenes");

// TODO: Статусы перенести в кеш(автоматизировать)
async function findSavedStatus(ctx, userId, postId)
{
  let user = await ctx.base.getUser(userId);
  return user.saved.find((post)=> ("" + post._id) === ("" + postId)) != undefined;
}
async function findReportStatus(ctx, userId, postId)
{
  let user = await ctx.base.getUser(userId);
  return user.reports && user.reports.indexOf(postId) != -1;
}
async function findCommentStatus(ctx, userId, postId)
{
  let comment = await ctx.base.getComment(postId, userId);
  return comment !== undefined;
}

function makeStepOf(i, array) {
  return "(" + (i+1) + "/" + array.length + ") " + array[i];
}

function clearStep(str) {
  return str.replace(str.match(/\(\d\/\d\)\s/)[0], "");
}

async function updateInline(ctx, controller, text) {
  let cache = ctx.session.cache,
    postId = cache.array[cache.indexWork]._id;
  if (text === undefined || text === "") {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: ctx.session.inlineKeyboard.now(cache, postId)
    }).catch(()=>{});
  } else {
    await ctx.editMessageText(
      text,
      Extra.markup(Markup.inlineKeyboard(controller.now(cache, postId)))
    ).catch(()=>{});
  }
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
    [Markup.callbackButton("⬅ Назад", "rateback")],
  ];
}

function inlineMain(cache, postId) {
  return [
    [Markup.callbackButton((cache.rated_status) ? "Изменить оценку": "Оценить работу", "gorate")],
    [Markup.callbackButton((cache.comented_status) ? "Изменить комментарий": "Прокомментировать", "gocoment")],
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

function inlineComment(cache, postId) {
  return [[Markup.callbackButton("⬅ Назад", "commentback")]];
}

async function seen(ctx) {
  let cache = ctx.session.cache,
    postId = cache.array[cache.indexWork]._id;
  if (cache.rated_status) {
    await ctx.base.seenPost(ctx.from.id, postId);
  }
}

async function showToRate(ctx) {
  let user = ctx.user,
    cache = ctx.session.cache,
    postId = cache.array[cache.indexWork]._id,
    rate = await ctx.base.getRate(postId, ctx.from.id);
  cache.strings = [(rate.count ? "Средняя оценка работы: " + rate.avg.toFixed(2) + "\n\nОцените работу:" : "Работу ещё никто не оценил, станьте первым!")];
  if (rate.my) {
    cache.strings.push(...ctx.user.rateToStrings(rate.my));
    cache.rated_status = rate.my;
  }
  cache.rates = [];
  cache.responsedMessageCounter = await user.sendWork(ctx);
  await ctx.reply(
    cache.strings.join("\n"),
    Extra.HTML().markup((m) =>
      m.inlineKeyboard(inlineMain(cache, postId))
    )
  );
  cache.responsedMessageCounter += 1;
  return cache.responsedMessageCounter;
}

new class RateScene extends Scene {
  constructor() {
    super("Rate");
    super.struct = {
      enter: [[this.enter]],
      action: [
        [/commentback/, this.goCommentBack],
        [/gorate/, this.goRate],
        [/gocoment/, this.goComment],
        [/rateback/, this.goRateBack],
        [/([1-5])-([\w\D]*)/, this.ratePost],
        [/save-([\w\D]*)/, this.savePost],
        [/([1-3])report-([\w\D]*)/, this.reportPost],
        [/report-([\w\D]*)/, this.goReport],
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
    cache.comented_status = undefined;
    
    ctx.session.inlineKeyboard = new InlineController;
    ctx.session.inlineKeyboard.stage({
      Report: inlineReport,
      Rate: inlineRate,
      Main: inlineMain,
      Comment: inlineComment,
    }).go("Main");
  }

  async savePost(ctx) {
    const cache = ctx.session.cache,
      postId = ctx.match[1];
    if (cache.saved_status) {
      await ctx.answerCbQuery("Уже сохранено");
      return;    
    } 
    cache.saved_status = true;
    await updateInline(ctx, ctx.session.inlineKeyboard);
    await ctx.base.savePost(ctx.chat.id, postId);
    await ctx.answerCbQuery("Сохранено");
  }

  async ratePost(ctx) {
    const cache = ctx.session.cache,
      postId = ctx.match[2],
      rate = ctx.match[1],
      work = cache.array[cache.indexWork];
    cache.rates.push(rate);
    cache.strings[cache.strings.length - 1] = 
      global.typesMarkName[work.type][cache.rates.length - 1] + " " + global.numEmoji[+rate];
    if (cache.rates.length < global.typesMark[work.type].length) {
      cache.strings.push(makeStepOf(cache.rates.length, global.typesMark[work.type]));
      await updateInline(ctx, ctx.session.inlineKeyboard, cache.strings.join("\n"));
    } else {
      cache.rated_status = true;
      delete cache.prevStrings;
      await updateInline(ctx, ctx.session.inlineKeyboard.goBack(), cache.strings.join("\n"));
      await ctx.base.putRate(ctx.from.id, postId, cache.rates);
      await seen(ctx);
    }
    await ctx.answerCbQuery("Вы поставили " + rate);
  }

  async goReport(ctx) {
    await updateInline(ctx, ctx.session.inlineKeyboard.go("Report"));
    await ctx.answerCbQuery("");
  }

  async reportPost(ctx) {
    const cache = ctx.session.cache,
      reportId = +ctx.match[1],
      postId = ctx.match[2];
    if (cache.report_status === true) {
      await ctx.answerCbQuery("Жалоба уже отправлена");
      return;
    } 
    cache.report_status = true;
    await ctx.base.putReport(postId, ctx.from.id, reportId);
    await ctx.base.seenPost(ctx.from.id, postId);
    await updateInline(ctx, ctx.session.inlineKeyboard.goBack());
    await ctx.answerCbQuery("Жалоба отправлена");
  }

  async goBack(ctx) {
    await updateInline(ctx, ctx.session.inlineKeyboard.goBack());
    await ctx.answerCbQuery("Назад");
  }

  async goRate(ctx) {
    let cache = ctx.session.cache,
      work = cache.array[cache.indexWork];
    if (work.type === undefined) work = cache.array[cache.indexWork] = await ctx.base.getPost(work._id);
    cache.rates = [];
    cache.prevStrings = cache.strings;
    cache.strings = [cache.strings[0]];
    if (cache.strings[0] === "Работу ещё никто не оценил, станьте первым!") cache.strings[0] = "";
    cache.strings.push(makeStepOf(0, global.typesMark[work.type]));
    await updateInline(ctx, ctx.session.inlineKeyboard.go("Rate"), cache.strings.join("\n"));
    await ctx.answerCbQuery("Можно приступить к оценке");
  }
  async goRateBack(ctx) {
    let cache = ctx.session.cache,
      work = cache.array[cache.indexWork];
    if (cache.rates.length > 0) {
      cache.rates.pop();
      cache.strings.pop();
      cache.strings[cache.strings.length - 1] = makeStepOf(cache.rates.length, global.typesMark[work.type]);
      await updateInline(ctx, ctx.session.inlineKeyboard, cache.strings.join("\n"));
    } else {
      cache.rates = [];
      cache.strings = cache.prevStrings || [cache.strings[0]];
      if (cache.strings[0] === "") cache.strings[0] = "Работу ещё никто не оценил, станьте первым!";
      await updateInline(ctx, ctx.session.inlineKeyboard.goBack(), cache.strings.join("\n"));
    }
    await ctx.answerCbQuery("");
  }

  async goComment(ctx) {
    let cache = ctx.session.cache,
      work = cache.array[cache.indexWork],
      postId = work._id;
    cache.need_comment = true;
    cache.ctx = ctx;
    let text = (cache.comented_status)?
      "Ваш комментарий:\n" +
      (await ctx.base.getComment(postId, ctx.from.id)).text + 
      "\n\nТеперь отправьте новый комментарий:":
      "Теперь отправьте свой комментарий:";
    await updateInline(ctx, ctx.session.inlineKeyboard.go("Comment"), text);
    await ctx.answerCbQuery("");
  }
  
  async goCommentBack(ctx) {
    let cache = ctx.session.cache;
    delete cache.need_comment;
    await updateInline(ctx, ctx.session.inlineKeyboard.goBack(), cache.strings.join("\n"));
    await ctx.answerCbQuery("Назад");
  }

  async nop(ctx) {
    await ctx.answerCbQuery("А всё уже, всё");
  }

  async main(ctx) {
    const user = ctx.user,
      cache = ctx.session.cache;
    let index = -1;
    
    if (cache.need_comment) {
      delete cache.need_comment;
      if (ctx.message.text != "⬅ Назад в ленту") {
        let postId = cache.array[cache.indexWork]._id;
        let comment = { 
          text: ctx.message.text, 
          userId: ctx.from.id, 
          postId: postId,
          username: "@" + ctx.from.username || ctx.from.first_name,
        };
        await ctx.deleteMessage();
        if (cache.comented_status) 
          await ctx.base.putComment(comment.postId, comment.userId, comment);
        else
          await ctx.base.setComment(comment);
        cache.comented_status = true;
        cache.responsedMessageCounter += 1;
        await updateInline(cache.ctx, ctx.session.inlineKeyboard.goBack(), cache.strings.join("\n"));
        await cache.ctx.answerCbQuery("Комментарий отправлен").catch(()=>{});
        return;
      }
    }
    
    if ((index = ["1⃣", "2⃣", "3⃣", "4⃣"].indexOf(ctx.message.text)) != -1) {
      cache.indexWork = index;
      cache.array = ctx.session.works;
      if (!cache.array[cache.indexWork]) {
        await ctx.reply("Работы с таким номером не существует, попробуйте ещё раз.");
        await user.checkDos(ctx, user.deleteLastNMessage);
        cache.responsedMessageCounter += 2;
      } else {
        const postId = cache.array[cache.indexWork]._id;
        cache.saved_status = await findSavedStatus(ctx, ctx.from.id, postId);
        cache.report_status = await findReportStatus(ctx, ctx.from.id, postId);
        cache.rated_status = undefined;
        cache.comented_status = await findCommentStatus(ctx, ctx.from.id, postId);
        await user.updateWith(ctx, showToRate);
      }
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
        ctx.session.inlineKeyboard = undefined;
        await ctx.base.putUser(ctx.from.id, { page: cache.index });
        await ctx.user.goMain(ctx);  
        break;
      case "one":
        await user.updateWith(ctx, user.sendWorksGroup);
        break;
      }
      break;
    case "⬅ Назад в ленту":
      await user.updateWith(ctx, user.sendWorksGroup);
      break;
    default:
      cache.responsedMessageCounter++;
    }
  }
};
