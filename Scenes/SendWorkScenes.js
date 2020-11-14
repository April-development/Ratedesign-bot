const { Scene, Markup } = require("./Scenes");
const { ObjectID } = require("mongodb");

async function sendWork(ctx) {
  const work = await ctx.base.setPost(ctx.session.work);
  await ctx.base.postedPost(ctx.from.id, work._id);
  await ctx.reply(
    "Работа успешно добавлена, найти её можно в разделе \"Мои работы\"\nЧтобы вернуться в главное меню нажмите \"назад\"",
    global.makeKeyboard(["🗳 Добавить ещё одну работу", "⬅ Назад"])
  );
  await ctx.scene.enter("SendWorkAgain");
}

new class SendWorkAgainScene extends Scene {
  constructor() {
    super("SendWorkAgain");
    super.struct = {
      on: [["text", this.main]],
    };
  }
  async main(ctx) {
    switch (ctx.message.text) {
    case "🗳 Добавить ещё одну работу":
      await ctx.scene.enter("SendWork");
      break;
    case "⬅ Назад":
      await ctx.user.goMain(ctx);
    }
  }
};

new class SendWorkScene extends Scene {
  constructor() {
    super("SendWork");
    super.struct = {
      enter: [[this.enter]],
    };
  }
  async enter(ctx) {
    const { message_id, chat } = await ctx.reply(
      "Выполните следующие действия:\n1. Отправьте все фотографии вашей работы в формате jpeg или png\n2. Нажмите кнопку ✅Готово\n\nПервая фотография будет использоваться в качестве превью к вашей работе",
      global.makeKeyboard(["✅ Готово", "⬅ Назад"])
    );
    ctx.session.caption = [chat.id, message_id];
    await ctx.scene.enter("SendWorkInit");
  }
};

new class SendWorkInitScene extends Scene {
  constructor() {
    super("SendWorkInit");
    super.struct = {
      enter: [[this.enter]],
      on: [
        ["photo", this.addPhoto],
        ["text", this.main],
      ],
    };
  }
  async enter(ctx) {
    ctx.session.work = {
      _id: ObjectID(), // ID поста
      authId: null, // это ID пользователя, отправившего изображение
      description: null, // описание работы
      photos: [], // массив ссылок на фотографии
      time: 0, // время создания
      rates: {},
      type: 0, // вид работы
    };
  }

  addPhoto(ctx) {
    const work = ctx.session.work; //  Получение работ из кеша
    work.authId = ctx.from.id; //  Id пользователя
    work.photos = work.photos || [];
    work.time = Date.now();
    work.photos.push(ctx.message.photo.pop().file_id); //  Получение самой графонисторй фотографии
  }

  async main(ctx) {
    const work = ctx.session.work;

    switch (ctx.message.text) {
    case "✅ Готово":
      //  Если есть фото и их можно вместить в альбом
      if (work.photos.length > 0 && work.photos.length < 10) {
        await ctx.scene.enter("TypedWork");
      } else {
        ctx.reply(((work.photos.length > 0)?
          "Вы отправили слишком много фотографий.\nВозможно прикрепить до 10 фотографий!"
          :"Вы не прикрепили ни одной фотографии.") + "\nДля загрузки работы выполните следующие действия:\n1. Отправьте все фотографии вашей работы в формате jpeg или png\n2. Нажмите кнопку ✅Готово\n\nПервая фотография будет использоваться в качестве превью к вашей работе");
        //  Очищение локального кеша с фотками
        work.photos = [];
      }
      break;
    case "⬅ Назад":
      await ctx.user.goMain(ctx);
    }
  }
};

let typeArray = ["UX/UI дизайн", "Графический дизайн"];
new class TypedWorkScene extends Scene {
  constructor() {
    super("TypedWork");
    super.struct = {
      enter: [[this.enter]],
      on: [["text", this.typed]],
    };
  }
  async enter(ctx) {
    await ctx.reply("Выберите область, к которой принадлежит работа", global.makeKeyboard(typeArray));
  }
  async typed(ctx) {
    let typeIndex = typeArray.indexOf(ctx.message.text) + 1;
    if (typeIndex) {
      ctx.session.work.type = typeIndex;
      await ctx.scene.enter("DescriptionQuestion");
    }
  }
};

new class DescriptionQuestionScene extends Scene {
  constructor() {
    super("DescriptionQuestion");
    super.struct = {
      enter: [[this.question]],
      on: [["text", this.main]],
    };
  }
  async question(ctx) {
    await ctx.reply(
      "Добавить описание?",
      global.makeKeyboard(["✅ Да", "❌ Нет", "⬅ Назад"])
    );
  }

  async main(ctx) {
    switch (ctx.message.text) {
    case "✅ Да":
      await ctx.scene.enter("EnterDescription");
      break;
    case "❌ Нет":
      await sendWork(ctx);
      await ctx.scene.enter("SendWorkAgain");
      break;
    case "⬅ Назад":
      await ctx.scene.enter("SendWork");
      break;
    }
  }
};

new class EnterDescriptionScene extends Scene {
  constructor() {
    super("EnterDescription");
    super.struct = {
      enter: [[this.askDescription]],
      on: [["text", this.addDescription]],
    };
  }
  async askDescription(ctx) {
    await ctx.reply(
      "Введите описание вашей работы",
      Markup.keyboard(["⬅ Назад"]).resize().extra()
    );
  }
  async addDescription(ctx) {
    if (ctx.message.text === "⬅ Назад")
      await ctx.scene.enter("DescriptionQuestion");
    else {
      ctx.session.work.description = ctx.message.text;
      await sendWork(ctx);
      await ctx.scene.enter("SendWorkAgain");
    }
  }
};
