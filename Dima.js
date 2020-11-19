const exec = require("child_process").exec;
const { execSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const {ObjectID} = require("mongodb");

String.prototype.chunk = function(size) {
  let chunks = [],
    pos = 0;
  while (pos < this.length) {
    chunks.push(this.substr(pos, pos += size));
  }
  return chunks;
};

function timeToString(time) {
  return (new Date(time)).toLocaleDateString("ru-RU", {
    day: "numeric", month: "numeric", year: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric"
  });
}

function userInfo(user) {
  return ((user.first_name || "") 
    + ((user.last_name) ? " " + user.last_name : "") 
    + (user.username ? " (" + user.username + ")" : "") || "unknown") 
    + (user.lastVisit ? "[" + timeToString(user.lastVisit) + "]": "") 
    + ": " + user.id + "\n";       
}

function haveCache(ctx) {
  return ctx.session && ctx.session.cache && ctx.session.cache.responsedMessageCounter !== undefined;
}

function updateResponseCounter(ctx, num) {
  if (haveCache(ctx) && ctx.chat.id === ctx.from.id)
    ctx.session.cache.responsedMessageCounter += num;
}

function sendLog(chatId) {
  execSync("cat <log.txt >send.txt");
  global.telegram.sendDocument(chatId, {
    source: "send.txt",
    filename: timeToString(Date.now()) + ".txt"
  }).catch((e) => global.Controller.emit("Error", e));
  execSync("echo \"\" >log.txt");
}

global.Controller.struct = {
  on: [["Error", async (...args) => {
    let text = Array(...args).join("");
    await global.telegram.sendMessage(global.logChat.id, text);
    sendLog(global.logChat.id);
  }]],
};

function download(url, dest, cb) {
  var file = fs.createWriteStream(dest);
  https.get(url, function(response) {
    response.pipe(file);
    file.on("finish", function() {
      file.close(cb);  // close() is async, call cb after close completes.
    });
  }).on("error", function(err) { // Handle errors
    fs.unlink(dest); // Delete the file async. (But we don't check the result)
    if (cb) cb(err.message);
  });
}

class Dima {
  async canDoThis(ctx) {
    let keyWord = "dima",
      forUser = "радик";

    if (ctx.message) {
      let msg = ctx.message.text || ctx.message.caption || "",
        words = msg.split(" ");
      if (words[0]) words[0] = words[0].toLowerCase();
      
      let probability = 0.3;
      if (
        (ctx.chat.type === "supergroup" || ctx.chat.type === "group") && ( 
          (words && ctx.message.reply_to_message !== undefined && words[0] === forUser && ctx.message.reply_to_message.photo)
          || (probability > Math.random() && ctx.message.photo)
          || (words[0] === forUser && ctx.message.photo)
        )
      ) {
        let mark = Math.round(Math.random() * 10);
        await ctx.telegram.sendMessage(ctx.chat.id,
          "Я бы оценил этот дизайн на " + mark + " из 10" +
          (mark < 3 ? "\n\nОценка невысока, переходите в @ratedesignbot, вашу работу оценят дизайнеры и помогут ее улучшить": ""),
          {
            allow_sending_without_reply: false,
            reply_to_message_id: ctx.message.message_id
          }
        );
        return true;
      }
      
      if (words[0] == keyWord) { 
        if (global.adminsIds.indexOf(ctx.from.id) != -1) {
          let cmd = "echo \"No commands\" && exit 1",
            text = msg.slice(keyWord.length + 1);
          if (words[1] !== undefined) {
            switch (words[1])
            {
            case "id":
              if (words[2] !== undefined) {
                let id = +words[2];
                if (!isNaN(id)) {
                  let user = (await global.DataBaseController.getUser(id)).user;
                  let responce = userInfo(user);
                  await ctx.reply(responce);
                  updateResponseCounter(ctx, 2);  
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
                    responce += userInfo(user);
                  let chunks = responce.chunk(4000);
                  for (let part of chunks) await ctx.reply(part);
                  updateResponseCounter(ctx, chunks.length + 1);
                }
              } else {
                await ctx.reply(ctx.from.id);
                updateResponseCounter(ctx, 2);
              }
              return true;
            case "pid": 
              ctx.replyWithMarkdown("pid: `" + process.pid + "`");
              updateResponseCounter(ctx, 2);
              return true;
            case "stdout": 
              ctx.reply("stdout: " + process.stdout.fd);
              updateResponseCounter(ctx, 2);
              return true;
            case "shutdown": 
              ctx.reply("shutdowning!");
              updateResponseCounter(ctx, 2);
              setTimeout(() => process.exit(0), 10000);
              return true;
            case "ids": {
              let users = (await global.DataBaseController.get("User")).map(data => data.user),
                responce = "";
              for (let user of users)
                responce += userInfo(user);
              let chunks = responce.chunk(4000);
              for (let part of chunks) await ctx.reply(part);
              updateResponseCounter(ctx, chunks.length + 1);
              return true;
            }
            case "info":
              if (haveCache(ctx) && ctx.session.cache.status === "one") {
                let cache = ctx.session.cache;
                let {_id, authId, time, reports} = cache.array[cache.indexWork];
                updateResponseCounter(ctx, 2);
                reports = reports || [0, 0, 0];
                let sum = reports.reduce((p, c) => p + c) || 0;
                await ctx.replyWithMarkdown(
                  "Post: `\"" + _id +
                  "\"`\nAuth: `" + authId +
                  "`\nDate: `" + timeToString(time) + "`"+
                  "\nReports: " + sum + (sum ? " {" + reports.map((e)=>((e/sum).toFixed(2) * 100) + "%") + "}": "")
                );
              }
              return true;
            case "remove":
              if (ctx.session && ctx.session.cache && ctx.session.cache.status === "one") {
                let cache = ctx.session.cache;
                const postId = cache.array[cache.indexWork]._id;
                updateResponseCounter(ctx, 2);
                await global.DataBaseController.deletePost(postId);
                ctx.reply("Removed");
              }
              return true;
            case "ban":
              if (words[2] !== undefined) {
                let postId = words[2];
                updateResponseCounter(ctx, 2);
                let post = (await global.DataBaseController.get("BanedPost", {"_id": ObjectID(postId)}))[0];
                if (post === undefined) {
                  ctx.reply("Don`t found this one.");
                  return true;
                }
                await global.DataBaseController.set("Post", post);
                await global.DataBaseController.remove("BanedPost", {"_id": ObjectID(postId)});
                await ctx.replyWithMarkdown("State back `"+ postId + "`");
              } else 
              if (ctx.session && ctx.session.cache && ctx.session.cache.status === "one") {
                let cache = ctx.session.cache;
                const postId = cache.array[cache.indexWork]._id;
                updateResponseCounter(ctx, 2);
                let post = await global.DataBaseController.getPost(postId);
                await global.DataBaseController.set("BanedPost", post);
                await global.DataBaseController.deletePost(postId);
                await ctx.replyWithMarkdown("Baned `"+ postId + "`");
              } else {
                await ctx.reply("Банить нечего!");
                updateResponseCounter(ctx, 2);
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
                  updateResponseCounter(ctx, chunks.length + 1);
                } catch (error) {
                  ctx.reply(error.toString());
                  updateResponseCounter(ctx, 2);
                }
              } else {
                ctx.reply("Не трать моё время, скажи что тебе нужно!");
                updateResponseCounter(ctx, 2);
              }
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
            case "send":
              if (ctx.message.document && words[2] != "") {
                let doc = ctx.message.document;
                let fd = await ctx.telegram.getFile(doc.file_id);
                download(`https://api.telegram.org/file/bot${ctx.tg.token}/${fd.file_path}`, words[2], (...e) => ctx.reply(e));
              }
              return true;
            case "get":
              if (words.length >= 2 && words[2] != "")
              {
                let fileName = words[2];
                fs.readFile(fileName, { encoding: "utf-8" }, async (error) => {
                  if (error) await (ctx.reply(error));
                  else ctx.telegram.sendDocument(ctx.chat.id, {
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
          exec(cmd, (...param) => {
            const send = async (err, stdout, stderr) => {
              let msg = "Responce:\n" + stdout + ((stderr) ? ("\nLog: " + stderr) : "") + "\n" + (err || "");
              let chunks = msg.chunk(4000);
              for (let part of chunks) await ctx.reply(part);
              updateResponseCounter(ctx, chunks.length + 1);
              console.log("'", msg, "'");
            };
            ctx.reply(cmd + ": ended");
            updateResponseCounter(ctx, 1);
            send(...param).catch(console.log);
          });
          return true;
        }
      }
    }
    return ctx.chat.type !== "private";
  }
  middleware() {
    setInterval(()=>{
      let stat = fs.statSync("log.txt");
      if (stat.size > 1E+6) {
        sendLog(global.logChat.id);
      }
    }, 60000);
    return async (ctx, next) => {
      // Весьма прозаично :)
      if (await this.canDoThis(ctx)) return;
      await next();
    };
  }
}

module.exports = new Dima();
