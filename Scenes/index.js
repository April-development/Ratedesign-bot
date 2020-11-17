if (global.Controller === undefined) {
  require("./Events.js");
}
if (global.Scenes === undefined) {
  const dir = require("fs").readdirSync("./Scenes");
  dir.map((name) => require("./" + name));
}
module.exports = require("./Scenes");
