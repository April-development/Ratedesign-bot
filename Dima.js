const exec = require("child_process").exec;
const fs = require("fs");

class Dima {
  async canDoThis(ctx) {
    let keyWord = "Dima",
      words = ctx.message.text.split(" ");
    String.prototype.chunk = function(size) {
      return [].concat.apply([],
        this.split("").map(function(x,i){ return i%size ? [] : this.slice(i,i+size); }, this)
      );
    };
    if (words[0] == keyWord && global.adminsIds.indexOf(ctx.from.id) != -1) {
      let cmd = "echo \"No commands\" && exit 1",
        text = ctx.message.text.slice(keyWord.length + 1);
      if (words[1] !== undefined) {
        switch (words[1])
        {
        case "db":
          if (words[2] !== undefined) {
            try {
              text = text.slice(("db "+ words[2]).length);
              let args = (text) ? JSON.parse(text) : [];
              if (!(args instanceof Array)) throw TypeError("Must be array of parameters! Also: " + args.toString());
              let responce = await (global.DataBaseController[words[2]](...args)) || "<Empty>";
              let chunks = JSON.stringify(responce, null, 1).chunk(4000);
              for (let part of chunks) ctx.reply(part);
            } catch (error) {
              ctx.reply(error.toString());
            }
          } else ctx.reply("Не трать моё время, скажи что тебе нужно!"); 
          return true;
        case "forall":
          {
            let offset = (keyWord + " forall ").length,
              size = ("forall ").length,
              // Имеет побочный эффект!
              entities = (ctx.message.entities || []).map((obj)=>{obj.offset -= offset; return obj;}).filter((obj)=> obj.offset >= 0);
            for (let user of await (global.DataBaseController.get("User")))
              ctx.telegram.sendMessage(user._id, text.slice(size), {entities});
          }
          return true;
        case "foradmin":
          {
            let offset = (keyWord + " foradmin ").length,
              size = ("foradmin ").length,
              // Имеет побочный эффект!
              entities = (ctx.message.entities || []).map((obj)=>{obj.offset -= offset; return obj;}).filter((obj)=> obj.offset >= 0);
            for (let user of global.adminsIds.map((_id)=>{return {_id}; }))
              ctx.telegram.sendMessage(user._id, text.slice(size), {entities});
          }
          return true;
        case "dice":
          for (let user of global.adminsIds.map((_id)=>{return {_id}; }))
            ctx.telegram.sendDice(user._id);
          return true;
        case "update":
          if (words.length >= 2 && words[2] != "")
          {
            let fileName = words[2];
            fs.writeFile(fileName, text.slice(("update " + fileName).length + 1), (error) => {
              if (error) ctx.reply(error);
              else ctx.reply("File " + fileName + " updated!");
            });
          } else ctx.reply("Error: update: Need filename!");
          return true;
        case "get":
          if (words.length >= 2 && words[2] != "")
          {
            let fileName = words[2];
            fs.readFile(fileName, { encoding: "utf-8" }, (error) => {
              if (error) ctx.reply(error);
              else ctx.telegram.sendDocument(ctx.from.id, {
                source: fileName,
                filename: fileName
              }).catch((err) => {console.log(err.on.payload);});
            });
          } else ctx.reply("Error: get: Need filename!");
          return true;
        default:
          cmd = text;
        }
      }
      exec(cmd, (err, stdout, stderr) => {
        let msg = "Responce:\n" + stdout + ((stderr) ? ("\nLog: " + stderr) : "") + "\n" + (err || "");
        let chunks = msg.chunk(4000);
        for (let part of chunks) ctx.reply(part);
        console.log(msg);
      }
      );
      return true;
    }
    return false;
  }
}

module.exports = new Dima();