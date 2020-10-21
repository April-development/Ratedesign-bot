const { ObjectID } = require("mongodb");

function uniq(a) {
  let prims = new Map(),
    out = [],
    j = 0;
  for (let e of a) {
    if (!prims[e._id]) {
      out[j++] = e;
      prims[e._id] = true;
    }
  }
  return [out.length === a.length, out];
}

function average(nums) {
  if (nums.length === 0) return 0.0;
  return nums.reduce((a, b) => (+a + +b)) / nums.length;
}

class DataBase {
  constructor() {
    global.DataBaseController = this;
    this.mongodb = require("mongodb");
    global.Controller.once("DataBaseConnect", this.connect);
  }
  connect(name, config) {
    global.DataBaseController.mongodb
      .MongoClient(...config)
      .connect((err, client) => {
        if (err !== null) {
          global.Controller.emit("Error", err);
          return;
        }
        global.DataBase = client.db(name);
        global.Controller.emit("DataBaseConnected");
      });
  }
  static get() {
    return new DataBase();
  }
  middleware() {
    return (ctx, next) => {
      ctx.base = this;
      next();
    };
  }
  async set(name, note) {
    const collection = global.DataBase.collection(name);
    try {
      const resp = await collection.insertOne(note);
      return resp.ops[0];
    } catch (e) {
      global.Controller.emit("Error", e);
    }
  }
  async get(name, details) {
    const collection = global.DataBase.collection(name);
    try {
      const resp = await collection.find(details).toArray();
      return resp;
    } catch (e) {
      global.Controller.emit("Error", e);
    }
  }
  async update(name, details, toUpdate) {
    const collection = global.DataBase.collection(name);
    try {
      const resp = await collection.updateMany(details, { $set: toUpdate });
      return resp.ops;
    } catch (e) {
      global.Controller.emit("Error", e);
    }
  }
  async remove(name, details) {
    const collection = global.DataBase.collection(name);
    try {
      const resp = await collection.deleteMany(details);
      return resp.ops;
    } catch (e) {
      global.Controller.emit("Error", e);
    }
  }
  async getUser(userId) {
    console.log("getUser: ", userId);
    return (await global.DataBaseController.get("User", { _id: userId }))[0];
  }
  async setUser(user) {
    console.log("putUser: ", user);
    return await global.DataBaseController.set("User", user);
  }
  async putUser(userId, user) {
    console.log("putUser: ", userId, user);
    return await global.DataBaseController.update(
      "User",
      { _id: userId },
      user
    );
  }
  async putPost(postId, post) {
    console.log("putPost: ", postId, post);
    return await global.DataBaseController.update(
      "Post",
      { _id: ObjectID(postId) },
      post
    );
  }
  async getPost(postId) {
    console.log("getPost: ", postId);
    return (await global.DataBaseController.get("Post", { _id: ObjectID(postId) }))[0];
  }

  async getNotSeenPosts(userId) {
    console.log("getNotSeenPosts: ", userId);
    let user = (
        await global.DataBaseController.get("User", { _id: userId })
      )[0],
      posts = await global.DataBaseController.get("Post");
    return uniq(user.seen.concat(posts))[1]
      .filter((obj) => obj.photos && obj.authId != userId)
      .map((obj) => {
        return { _id: obj._id, preview: obj.photos[0] };
      });
  }
  async deletePost(postId) {
    console.log("deletePost: ", postId);
    return await global.DataBaseController.remove("Post", { _id: ObjectID(postId) });
  }
  async savePost(userId, postId) {
    console.log("savePost: ", userId, postId);
    let user = await this.getUser(userId);
    let uniqed = false;
    user.saved.push({ _id: ObjectID(postId) });
    [uniqed, user.saved] = uniq(user.saved);
    if (uniqed) {
      await global.DataBaseController.putUser(userId, { saved: user.saved });
    }
  }
  async seenPost(userId, postId) {
    console.log("seenPost: ", userId, postId);
    let user = await global.DataBaseController.getUser(userId);
    let uniqed = false;
    user.seen.push({ _id: postId });
    [uniqed, user.seen] = uniq(user.seen);
    if (uniqed) {
      await global.DataBaseController.putUser(userId, { seen: user.seen });
    }
  }
  async postedPost(userId, postId) {
    console.log("postedPost: ", userId, postId);
    const user = await global.DataBaseController.getUser(userId);
    let uniqed = false;
    user.posted.push({ _id: postId });
    [uniqed, user.posted] = uniq(user.posted);
    if (uniqed) {
      await this.putUser(userId, { posted: user.posted });
    }
  }
  async setPost(post) {
    console.log("setPost: ", post);
    return await global.DataBaseController.set("Post", post);
  }
  countRate(post)
  {
    console.log("countRate: ", post);
    post.rates = post.rates || {};
    return average(Object.values(post.rates));
  }
  async getRate(postId)
  {
    console.log("getRate: ", postId);
    let post = await global.DataBaseController.getPost(postId);
    return this.countRate(post);
  }
  async putRate(id, postId, rate)
  {
    console.log("putRate: ", id, postId, rate);
    let post = await global.DataBaseController.getPost(postId);
    if (!post) return;
    post.rates = post.rates || {};
    post.rates[id] = rate;
    await global.DataBaseController.putPost(post._id, { rates: post.rates });
  }
  async putReport(postId, userId, reportId) // TODO: Оптимизировать
  {
    console.log("putReport: ", postId, userId, reportId);
    let post = await global.DataBaseController.getPost(postId),
      user = await global.DataBaseController.getUser(userId);
    // user check
    if (user.reports === undefined) user.reports = [];
    if (user.reports.indexOf(postId) != -1) return; 
    // work with user
    user.reports.push(postId);
    await global.DataBaseController.putUser(userId, {reports: user.reports});
    // work with post
    if (post.reports === undefined) post.reports = [0, 0, 0];
    if (reportId < post.reports.length)
      post.reports[reportId]++;
    else
      throw "DataBase: putReport: invalid report id";
    await global.DataBaseController.putPost(postId, {reports: post.reports});
  }
}

module.exports = DataBase;
