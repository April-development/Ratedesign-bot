class Wrapper {
  constructor() {
    this.users = new Map(); //  Как объект, но быстрее
  }
  //  Для удобного экспорта через new
  static get() {
    return new Wrapper();
  }
  //  Расширение контекста объектом данного класса
  middleware() {
    return async (ctx, next) => {
      //  Рашсирение контекста
      ctx.wrap = this;
      //  Антиспам пользователей, который ебашит пермач до
      //  тех пор, пока все запросы не обработаются
      if (this.users[ctx.from.id] === undefined) await next();
    };
  }
  //  Блочит следующие запросы
  alloc(ctx) {
    this.users[ctx.from.id] = "busy";
  }
  //  Отключает блок запросов
  free(ctx) {
    this.users[ctx.from.id] = undefined;
  }
  //  Проверяет не хотят ли задудосить сервер и блокирует пользователя на 5 секунд
  async checkDos(ctx, callback) {
    const show = ctx.session.show;
    if (show.responsedMessageCounter > 35) {
      this.alloc(ctx);
      console.log("busy");
      await setTimeout(() => {
        if (callback) callback.call(ctx.user, ctx);
        if (this.users[ctx.from.id] === "busy") this.free(ctx);
        console.log("free");
      }, 5000);
    }
  }
}

module.exports = Wrapper;
