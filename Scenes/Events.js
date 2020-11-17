const { EventEmitter, captureRejectionSymbol } = require("events");

global.Fatal = function Fatal()
{
  while (function() {
    return true;
  }());
};

class Controller extends EventEmitter {
  constructor() {
    super({ captureRejections: true });
  }
  set struct(struct) {
    for (var name in struct) {
      for (var args of struct[name]) {
        for (var arg of args) {
          if (arg === undefined) {
            global.Controller.emit("Error", "Error: Controller.", name, "(", args, ")");
            global.Fatal();
          }
        }
        switch (name) {
        case "on":
          this.on(...args);
          break;
        case "once":
          this.once(...args);
          break;
        case "off":
          this.off(...args);
          break;
        case "pre":
          this.prependListener(...args);
          break;
        case "remove":
          this.removeListener(...args);
          break;
        }
      }
    }
  }
  [captureRejectionSymbol](err, event, ...args) {
    this.emit("Error", "Rejection happened for", event, "with", err, ...args);
  }
}
// Единыжды главный контроллер
if (global.Controller === undefined) global.Controller = new Controller();

global.Controller.struct = {
  on: [["Error", async (...args) => {
    let text = Array(...args).join("");
    console.log(text);
    await global.telegram.sendMessage(-1001392995022, text);
  }]],
};
