const { token, dbName, mongo } = require(process.env.BOT_CONFIG);

const { Telegraf, Markup, session, once } = require("./Scenes");

// Роутер бота
const bot = new Telegraf(token);

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
};

// Устанавливаем обработчики
bot.use(
  session(),
  user.middleware(),
  base.middleware(),
  global.Scenes.stage.middleware()
);

// Админы сила админы мощь
global.adminsIds = [711071113, 430830139, 367750507, 742576159, 949690401];
// bot.use(Telegraf.log());
// console.log(global.ScenesController.scenesId());

// Доступные на главной команды
bot.start(user.main);
bot.on("text", async (ctx) => {
  async function update(id) {
    let userInfo = (await (ctx.telegram.getChatMember)(id, id)).user;
    return await (global.DataBaseController.putUser)(id, {user: userInfo});
  }
  update(ctx.from.id);
  
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
  
  // Весьма прозаично :)
  if (await require("./Dima.js").canDoThis(ctx)) return;

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
  global.Controller.emit("DataBaseConnect", dbName, mongo);
  await once(global.Controller, "DataBaseConnected");
  await bot.launch();
  
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
