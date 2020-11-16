const exec = require("child_process").exec;
const fs = require("fs");

class Dima {
  async canDoThis(ctx) {
    if (ctx.message) {
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
          case "id":
            if (words[2] !== undefined) {
              let id = +words[2];
              if (!isNaN(id)) {
                let user = (await global.DataBaseController.getUser(id)).user;
                let responce = ((user.first_name || "") + ((user.last_name) ? " " + user.last_name : "") + (user.username ? " (" + user.username + ")" : "") || "unknown") + ": " + user.id + "\n";
                ctx.reply(responce);
                if (ctx.session && ctx.session.cache && ctx.session.cache.responsedMessageCounter !== undefined)
                  ctx.session.cache.responsedMessageCounter += 2;
              } else {
                let users = await global.DataBaseController.get("User", {"user.username": words[2]});
                if (!users.length)
                {
                  users = await global.DataBaseController.get("User", {"user.last_name": words[2]});
                  if (!users.length)
                    users = await global.DataBaseController.get("User", {"user.first_name": words[2]});
                }
                let responce = "";
                for (let {user} of users)
                  responce += ((user.first_name || "") + ((user.last_name) ? " " + user.last_name : "") + (user.username ? " (" + user.username + ")" : "") || "unknown") + ": " + user.id + "\n";
                let chunks = responce.chunk(4000);
                for (let part of chunks) await ctx.reply(part);
                if (ctx.session && ctx.session.cache && ctx.session.cache.responsedMessageCounter !== undefined)
                  ctx.session.cache.responsedMessageCounter += chunks.length + 1;
              }
            } else
              await ctx.reply(ctx.from.id);
            return true;
          case "ids": {
            let users = (await global.DataBaseController.get("User")).map(data => data.user),
              responce = "";
            for (let user of users)
              responce += ((user.first_name || "") + ((user.last_name) ? " " + user.last_name : "") + (user.username ? " (" + user.username + ")" : "") || "unknown") + ": " + user.id + "\n";
            let chunks = responce.chunk(4000);
            for (let part of chunks) await ctx.reply(part);
            if (ctx.session && ctx.session.cache && ctx.session.cache.responsedMessageCounter !== undefined)
              ctx.session.cache.responsedMessageCounter += chunks.length + 1;
            return true;
          }
          case "info":
            if (ctx.session && ctx.session.cache && ctx.session.cache.status === "one") {
              let cache = ctx.session.cache;
              const {_id, authId, time} = cache.array[cache.indexWork];
              console.log(cache.array[cache.indexWork]);
              cache.responsedMessageCounter += 2;
              await ctx.replyWithMarkdown(
                "Post: `" + _id +
                "`\nAuth: `" + authId +
                "`\nDate: `" + (new Date(time)).toLocaleDateString("ru-RU", {
                  day: "numeric", month: "numeric", year: "numeric",
                  hour: "numeric", minute: "numeric", second: "numeric"
                }) + "`");
            }
            return true;
          case "remove":
            if (ctx.session && ctx.session.cache && ctx.session.cache.status === "one") {
              let cache = ctx.session.cache;
              const postId = cache.array[cache.indexWork].postId;
              cache.responsedMessageCounter += 2;
              ctx.reply(await global.DataBaseController.remove("Post", {_id: postId}));
            }
            return true;
          case "db":
            if (words[2] !== undefined) {
              try {
                text = text.slice(("db "+ words[2]).length);
                let args = (text) ? JSON.parse(text) : [];
                if (!(args instanceof Array)) throw TypeError("Must be array of parameters! Also: " + args.toString());
                let responce = await (global.DataBaseController[words[2]](...args)) || "<Empty>";
                let chunks = JSON.stringify(responce, null, 1).chunk(4000);
                for (let part of chunks) ctx.reply(part);
                if (ctx.session && ctx.session.cache && ctx.session.cache.responsedMessageCounter !== undefined)
                  ctx.session.cache.responsedMessageCounter += chunks.length + 1;
              } catch (error) {
                ctx.reply(error.toString());
                if (ctx.session && ctx.session.cache && ctx.session.cache.responsedMessageCounter !== undefined)
                  ctx.session.cache.responsedMessageCounter += 2;
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
              fs.writeFile(fileName, text.slice(("update " + fileName).length + 1), async (error) => {
                if (error) ctx.reply(error);
                else await ctx.reply("File " + fileName + " updated!");
              });
            } else await ctx.reply("Error: update: Need filename!");
            return true;
          case "get":
            if (words.length >= 2 && words[2] != "")
            {
              let fileName = words[2];
              fs.readFile(fileName, { encoding: "utf-8" }, async (error) => {
                if (error) await (ctx.reply(error));
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
        exec(cmd, async (err, stdout, stderr) => {
          let msg = "Responce:\n" + stdout + ((stderr) ? ("\nLog: " + stderr) : "") + "\n" + (err || "");
          let chunks = msg.chunk(4000);
          for (let part of chunks) await ctx.reply(part);
          if (ctx.session && ctx.session.cache && ctx.session.cache.responsedMessageCounter !== undefined)
            ctx.session.cache.responsedMessageCounter += chunks.length + 1;
          console.log(msg);
        }
        );
        return true;
      }
    }
    return false;
  }
  middleware() {
    return async (ctx, next) => {
      // Весьма прозаично :)
      if (await this.canDoThis(ctx)) return;
      await next();
    };
  }
}

module.exports = new Dima();