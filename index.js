const { token, dbName, mongo } = require(process.env.BOT_CONFIG);

// Роутер бота
global.bot = new (require("telegraf"))(token);
global.telegram = new (require("telegraf/telegram"))(token);
global.logChat = { id: -1001392995022 };

var { Markup, session } = require("./Scenes");

// Обработка обращений к базе данных
const base = require("./Wrapper/DataBase").get();
// Обработка упращённых обращений
const user = require("./Wrapper/User").get();
// Главная
user.main = async (ctx) => {
  const { message_id, chat } = await ctx.reply(
    "📃 Главное меню",
    Markup.keyboard([
      "📌 Выложить работу",
      "🏆 Оценить чужие работы",
      "📊 Посмотреть оценки своих работ",
      "📎 Сохраненное",
    ]).resize().extra()
  );
  ctx.session.caption = [chat.id, message_id];
  ctx.session.cache = undefined;
};

// Устанавливаем обработчики
global.bot.use(
  session(),
  user.middleware(),
  base.middleware(),
  require("./Dima.js").middleware(),
  global.Scenes.stage.middleware()
);

// Админы сила админы мощь
global.adminsIds = [711071113, 430830139, 367750507, 742576159, 949690401];
// bot.use(Telegraf.log());
// console.log(global.ScenesController.scenesId());

// Доступные на главной команды
global.bot.start(user.main);
global.bot.on("text", async (ctx) => {
  if (!ctx.session.caption) await user.main(ctx);
  if (!ctx.session.inited && !(await ctx.base.getUser(ctx.from.id)))
    await ctx.base.setUser({
      _id: ctx.from.id,
      user: (await ctx.telegram.getChatMember(ctx.from.id,ctx.from.id)).user,
      saved: [],
      posted: [],
      seen: [],
      page: 0,
      reports: [],
    });
  ctx.session.inited = true;
  
  async function update(id) {
    let userInfo = (await (ctx.telegram.getChatMember)(id, id)).user;
    userInfo.lastVisit = Date.now();
    return await (global.DataBaseController.putUser)(id, {user: userInfo});
  }
  await update(ctx.from.id);

  switch (ctx.message.text) {
  case "📊 Посмотреть оценки своих работ":
    await ctx.scene.enter("MyWorks");
    break;
  case "📎 Сохраненное":
    await ctx.scene.enter("Saved");
    break;
  case "📌 Выложить работу":
    await ctx.scene.enter("SendWork");
    break;
  case "🏆 Оценить чужие работы":
    await ctx.scene.enter("Rate");
    break;
  }
});

global.Controller.once("Launch", async () => {
  await global.DataBaseController.connect(dbName, mongo);
  await global.bot.launch();
  
  //console.log(await global.DataBaseController.remove("Post"));    //---------+
  //console.log(await global.DataBaseController.remove("User"));   // For vipe |
  //for (let id of global.adminsIds)                              //           | 
  //  await global.DataBaseController.putUser(id, { seen: [] }); //------------+

  //console.log(await global.DataBaseController.get("Post"));     //----------+
  //console.log(await global.DataBaseController.get("User"));    // For debug |
  //                                                            //------------+
  
  console.log("Listening...");
});

global.Controller.emit("Launch");
