const Wrapper = require("./Wrapper");
const {Markup} = require("telegraf");
const {Mutex} = require("async-mutex");

global.typesMark = [
  [""],
  [
    "Оцените UX (юзабилити): ",
    "Оцените UI: ",
    "Оцените типографику: ",
    "Оцените реализацию стиля и композицию: ",
    "Оцените контент/графику: "],
  [
    "Оцените реализацию стиля: ",
    "Оцените композицию: ",
    "Оцените типографику: ",
    "Оцените цветовые решения: ",
    "Оцените считываемость: "
  ]
];
global.typesMarkName = [
  [""],
  [
    "UX(юзабилити): ",
    "UI: ",
    "Типографика: ",
    "Реализация стиля и композиции: ",
    "Контент/графика: "],
  [
    "Реализация стиля: ",
    "Композиция: ",
    "Типографика: ",
    "Цветовые решения: ",
    "Считываемость: "
  ]
];
global.numEmoji = ["0⃣", "1⃣", "2⃣", "3⃣", "4⃣", "5⃣", "6⃣", "7⃣", "8⃣", "9⃣"];

function criteria(rate) {
  return rate.map((m, i) => " " + global.typesMarkName[rate.type][i] + m.toFixed(2)).join("\n");
}

function getDate(time) {
  return (new Date(time)).toLocaleDateString("ru-RU", { month: "long", day: "numeric" });
}

global.makeKeyboard = (keyboard) => {
  return Markup.keyboard(keyboard).resize().extra();
};

class User extends Wrapper {
  constructor() {
    super();
    //  Колбэк корневой сцены - задаётся вручную
    this.main = async () => {};
  }
  //  Для удобного экспорта через new
  static get() {
    return new User();
  }
  //  Расширение контекста объектом данного класса
  middleware() {
    return async (ctx, next) => {
      (async () => {
        //  Рашсирение контекста
        ctx.user = this;
        //  Одновременно обрабатываем только один запрос от одного пользователя иначе скипаем
        ctx.session.mutex = ctx.session.mutex || new Mutex;
        console.log(ctx.from.id + "(" + (ctx.from.username || ctx.from.first_name || "unknown") + "):", (ctx.session.mutex.isLocked()) ? "skip" : "todo",
          (ctx.message) ? "\"" + ctx.message.text + "\"" :
            (ctx.update.callback_query) ? ctx.update.callback_query.data : "");
        if (ctx.session.mutex.isLocked()) {
          if (ctx.message) ctx.deleteMessage();
          return;
        }
        const release = await ctx.session.mutex.acquire(); // Делаем всё последовательно
        try {
          await next();
        } catch (e) {
          global.Controller.emit("Error", e.on);
        } finally {
          release();
        }
      })();
    };
  }
  //  Типиизрует токены фотографий для кормления api телеги
  typedAsPhoto(arr, desc) {
    return arr.map((elem, index) => {
      return index === 0 ? { type: "photo", media: elem, caption: desc } : { type: "photo", media: elem };
    });
  }
  //  Смещения указателя cache.index на shift в пределах cache.size
  shiftIndex(ctx, shift) {
    const cache = ctx.session.cache;
    console.log("user.shiftIndex: ", shift, cache.index, cache.size);
    if (cache.index !== -1) {
      // -1, если нечего индексировать
      cache.index = (cache.index + ((cache.size + shift) % cache.size)) % cache.size; //  Само смещение
    }
    console.log("-> New index: ", cache.index);
    if (cache.index.toString() === "NaN") {
      cache.index = 0;
    }
    return ctx;
  }
  // Обновление показываемого пользователю
  async updateWith(ctx, update) {
    let count = ctx.session.cache.responsedMessageCounter + 1;
    ctx.session.cache.responsedMessageCounter = await update.call(this, ctx);
    await this.deleteLastNMessage(ctx, count);
  }
  // Удаление послених N сообщений //TODO: сделать удаление на интервалах (для безопасного использования)
  async deleteLastNMessage(ctx, n) {
    this.alloc(ctx); //  Нужно тормознуть процессы для пользователя, так как удаление - дорогорстояющая операция
    n = n || ctx.session.cache.responsedMessageCounter + 1;
    console.log("DeletN: ", n);
    if (n < 1) return;
    /*
      Удалить можно только то сообщение, на которое указывает контекст
      Снизу - указателя для сообщений, который смещается на N,
      а затем удаляет все последующие посты
     */
    let messageToDelete = [];
    while (n--) {
      messageToDelete.push(ctx.update.message.message_id--);
    }
    // Делаем массив запросов на удаление 
    let promises = messageToDelete.map(async (messageId) => await ctx.telegram.deleteMessage(ctx.from.id, messageId).catch((err) => console.log("Error", err.on)));
    // Дожидаемся когда все они будут завершены
    (await Promise.all(promises));
    this.free(ctx); //  Конец сложных запросов, можно разжать булки
  }
  //  Отправка работ
  async sendWork(ctx, postId) {
    const cache = ctx.session.cache,
      posts = cache.array,
      keyboard = Markup.keyboard(cache.keyboard || ["⬅ Назад"]).resize().extra();
    cache.status = "one";
    postId =
      postId || (posts && posts[cache.indexWork] && posts[cache.indexWork]._id) || -1;
    if (postId === -1) {
      ctx.reply("Здесь пока ничего нет", keyboard);
      cache.responsedMessageCounter = 1;
      return 1;
    }
    const post = await ctx.base.getPost(postId);
    if (post === undefined) {
      ctx.reply("Пост удалён", keyboard);
      cache.responsedMessageCounter = 1;
      return 1;
    }
    // Дополняем описание информацией об оценках
    let description = post.description || "";
    cache.responsedMessageCounter = post.photos.length;

    await ctx.telegram.sendMediaGroup(
      ctx.from.id,
      this.typedAsPhoto(post.photos)
    ).catch(async (err) => {
      console.log("Error", err.on);
      await ctx.reply("error");
      cache.responsedMessageCounter = 1;
    });
    
    // Заготавливаем комментарий к работе
    let msg = ((description) ? `Описание: \n${description}\n` : "") + 
      "\nДата публикации: " + getDate(post.time);
    if (post.authId === ctx.from.id) {
      let rate = ctx.base.countRate(post);
      msg += (!rate.count) ? 
        "\n\nПока никто не оценил..." :
        "\n\nВсего оценок: " + rate.count +
        "\nСредняя оценка работы: " + rate.avg.toFixed(2) + 
        "\n\nОценки по критериям: \n" + criteria(rate);
    }
    
    // Отправляем комментарий
    await ctx.reply(msg, keyboard);
    cache.responsedMessageCounter += 1; // Не забываем про то что каждое новое сообщение влияет на размер сцены\
    
    if (post.authId === ctx.from.id) {
      let comments = await ctx.base.searchComments({postId: post._id});
      if (comments.length) {
        await ctx.replyWithMarkdown("*Комментарии:*");
        cache.responsedMessageCounter += 1;
        for (let comment of comments) {
          cache.responsedMessageCounter += 1;
          await ctx.reply("Пользователь " + (comment.username || "скрыл свой ник") + `\n\n"${comment.text}"`);
        }
      }
    }

    return cache.responsedMessageCounter;
  }
  // Размечает кеш
  indexed(ctx, array) { // TODO: Сделать chache отдельным классом сделать оптимизации, скрыть детали реализации
    let cache = ctx.session.cache,
      perPage = 4; // количество на странице
    cache.size = cache.index = ((array.length + perPage - 1) / perPage) | 0;
    cache.array = array;
    cache.perPage = perPage;
    cache.status = "many";
  }

  async sendPage(ctx, page) {
    //  Получение постов
    let cache = ctx.session.cache,
      posts = cache.array,
      perPage = cache.perPage; // Сколько превью выводим на одну страницу
    cache.status = "many";
    page = (!page) ? (cache.index = cache.index % cache.size) : (page % cache.size);
    if ("" + cache.index == "NaN") cache.index = -1;
    //  Получение старницы с постами
    let works = posts.slice(perPage * page, perPage * (page + 1));
    // Проверяем есть ли у нас нужная информация, если нет просим
    works = works.map((work) => {
      if (work.photos !== undefined || work.preview !== undefined)
        return work;
      else
        return global.DataBaseController.getPost(work._id); 
    });
    // Ждём, а затем правим посты
    works = (await Promise.all(works)) // TODO: Обратное кеширование
      .map((work)=>work && ((work.preview && work) || { _id: work._id, preview: work.photos[0] }))
      .map((obj)=>obj || { _id: 1, preview: "https://thumbs.dreamstime.com/b/simple-vector-circle-red-grunge-rubber-stamp-deleted-item-isolated-white-vector-circle-red-grunge-rubber-stamp-deleted-item-155433969.jpg" });
    // Если нет ничего нового
    if (works.length === 0) {
      cache.responsedMessageCounter = 1;
      ctx.reply(cache.empty || "Пусто...", Markup.keyboard(["⬅ Назад"]).resize().extra());
      return 1;
    }
    //  Отправка превьюшек полльхователю
    await ctx.telegram
      .sendMediaGroup(
        ctx.from.id,
        this.typedAsPhoto(works.map((it) => it.preview))
      )
      .catch(async (e) => {
        console.log("Error", e.on);
        works.length = 1;
        await ctx.reply("error");
      });
    //  Кешируем работы
    ctx.session.works = works;
    
    //  Сколько места занимает страница
    cache.responsedMessageCounter = works.length;
    await this.needNumber(ctx);
    return cache.responsedMessageCounter;
  }

  //  ОТПРАВЛЯЕТ страницу с ПРЕВЬЮ из ленты ПОЛЬЗОВАТЕЛЮ
  async sendWorksGroup(ctx, page) {
    //  Получение непросмотренных постов
    let posts = await ctx.base.getNotSeenPosts(ctx.from.id),
      cache = ctx.session.cache;
    cache.size = ((posts.length + cache.perPage - 1) / cache.perPage) | 0;
    [ posts, cache.array ] = [ cache.array, posts ];
    let size = await this.sendPage(ctx, page);
    [ posts, cache.array ] = [ cache.array, posts ];
    return size;
  }

  async needNumber(ctx)
  {
    if (ctx.session.works && ctx.session.works.length !== 0 && ctx.session.cache.index !== -1)
    {
      var buttonsArray = [
          ["⏪ Предыдущая страница", "⏩ Следующая страница"],
          ["⬅ Назад"],
        ],
        numButtons = ["1⃣", "2⃣", "3⃣", "4⃣"],
        cache = ctx.session.cache,
        generateKeyboardPageNavigator = function (btnCount){
          let res = [];
          if (btnCount > 0 && btnCount < 5) {
            res = [[]];
            for (let i = 1; i <= btnCount; ++i) {
              res[0].push(numButtons[i-1]);
            }
          } else if (btnCount > 0 && btnCount <= 8) {
            res = [[], []];
            const separator = ((btnCount+1) / 2) | 0;
            for (let i = 1; i <= separator; ++i) {
              res[0].push(numButtons[i-1]);
            }
            for (let i = separator + 1; i <= btnCount; ++i) {
              res[1].push(numButtons[i-1]);
            }
          }
          res = res.concat(buttonsArray);
          return res;
        };
      await this.reply(ctx,
        "Нажмите на номер работы для " + (cache.for || "просмотра"),
        generateKeyboardPageNavigator(ctx.session.works.length)
      );
      cache.responsedMessageCounter += 1;
    }
  }
  async reply(ctx, msg, keyboard)
  {
    keyboard = keyboard && Markup.keyboard(keyboard).resize().extra();
    return await ctx.reply(msg, keyboard);
  }

  //  Корневая сцена
  async goMain(ctx) {
    await ctx.scene.leave();
    await this.main(ctx);
  }
}

module.exports = User;
