var WebSocketServer = require("ws").Server;
var http = require("http");
var server = http.createServer();
var MersenneTwister = require("./MersenneTwister");
var Cataso = require("./cataso/Cataso");
var Kcataso = require("./kcataso/Kcataso");
var BattleRaiso = require("./battleraiso/BattleRaiso");
var Goipai = require("./goipai/Goipai");
var Blocas = require("./blocas/Blocas");
var db = require("./db");
var tripcode = require("./tripcode");

const redis = require("redis");

const redisURL =
  process.env.REDIS_TLS_URL ||
  process.env.REDIS_URL ||
  "redis://localhost:6379";
const client = redis.createClient({
  url: redisURL,
  socket: {
    tls: !!process.env.REDIS_TLS_URL,
    rejectUnauthorized: false,
  },
});
client.connect().catch((err) => console.log("Redis connect error =>", err));
db.init();
client.on("error", function (err) {
  console.log("Redis error =>", err);
});
client.on("reconnecting", () => console.log("Redis reconnecting"));

var roomList = [
  new Cataso(0, client), // 0
  new Cataso(1, client),
  new Cataso(2, client),
  new BattleRaiso(3, client),
  new Goipai(4, client),
  new Cataso(5, client),
  new Cataso(6, client),
  new Cataso(7, client),
  new Cataso(8, client),
  new Cataso(9, client),
  new Cataso(10, client), // 10
  new Cataso(11, client),
  new Cataso(12, client),
  new Cataso(13, client),
  new Cataso(14, client),
  new Cataso(15, client),
  new Cataso(16, client),
  new Cataso(17, client),
  new Cataso(18, client),
  new Cataso(19, client),
  new BattleRaiso(20, client), // 20
  new BattleRaiso(21, client),
  new BattleRaiso(22, client),
  new Goipai(23, client),
  new Goipai(24, client),
  new Cataso(25, client),
  new Kcataso(26, client),
  new Kcataso(27, client),
  new Kcataso(28, client),
  new Kcataso(29, client),
  new Kcataso(30, client), // 30
  new Blocas(31, client),
  new Blocas(32, client),
  new Blocas(33, client),
  new Blocas(34, client),
  new Blocas(35, client),
  // isAuth
  new Cataso(36, client, true), // 36
  new Cataso(37, client, true),
  new Cataso(38, client, true),
  new Cataso(39, client, true),
  new Cataso(40, client, true), // 40
  new BattleRaiso(41, client, true), // 41
  new BattleRaiso(42, client, true),
  new BattleRaiso(43, client, true),
  new BattleRaiso(44, client, true),
  new BattleRaiso(45, client, true),
  new Goipai(46, client, true), // 46
  new Goipai(47, client, true),
  new Goipai(48, client, true),
  new Goipai(49, client, true),
  new Goipai(50, client, true),
  new Kcataso(51, client, true), // 51
  new Kcataso(52, client, true),
  new Kcataso(53, client, true),
  new Kcataso(54, client, true),
  new Kcataso(55, client, true),
  new Blocas(56, client, true), // 56
  new Blocas(57, client, true),
  new Blocas(58, client, true),
  new Blocas(59, client, true),
  new Blocas(60, client, true), // 60
];

var User = function (ws, uid, trip, name) {
  this.ws = ws;
  this.uid = uid;
  this.trip = trip;
  this.name = name || uid;
};

var splitSyntaxType1 = function (source) {
  return source.substring(1);
};

var sendUserList = function (index, ws) {
  var buff = "";

  var i;
  var len1 = roomList[index].userList.length;
  for (i = 0; i < len1; i++) {
    if (i > 0) {
      buff += " ";
    }

    if (roomList[index].userList[i].trip !== "") {
      buff +=
        roomList[index].userList[i].uid +
        "%" +
        roomList[index].userList[i].trip;
    } else {
      buff += roomList[index].userList[i].uid;
    }
  }

  try {
    ws.send("A" + buff);
  } catch (e) {}
};

var createTrip = tripcode.createTrip;


var auth = function (index, trip) {
  if (!roomList[index].isAuth) return true;
  if (trip == "") return false;
  if (roomList[index].roomTrip && roomList[index].roomTrip !== trip) {
    return false;
  }
  var owner = roomList[index].userList.filter(
    (user) => user === roomList[index].owner
  );
  if (owner.length === 0) {
    return true;
  } else {
    if (owner[0].trip == "") {
      return true;
    }
    if (owner[0].trip === trip) {
      return true;
    }
    return false;
  }
};

var adminMessage = function (ws, message) {
  const [secret, msg] = splitSyntaxType1(message).split(",");

  const secretTrip = createTrip(secret);
  if (secretTrip === process.env.ADMIN_TRIP) {
    roomList.forEach((room) => {
      room.chat("管理人", "#E04DB0", msg);
    });
  }
};

var login = function (index, ws, message) {
  var isSuccessful = false;

  var token = splitSyntaxType1(message).split("#", 2);
  var name = token[0];
  var uid = token[0];

  var src;
  if (token.length > 1) {
    src = token[1];
  }

  var trip = "";
  if (src) {
    trip = createTrip(src);
    uid = `${uid}(${trip.substring(0, 6)})`;
  }

  if (
    name.length > 0 &&
    name.match(/^[0-9A-Za-z]{1,12}$/) &&
    auth(index, trip)
  ) {
    isSuccessful = true;

    var i;
    var len1 = roomList[index].userList.length;
    for (i = 0; i < len1; i++) {
      if (uid === roomList[index].userList[i].uid) {
        isSuccessful = false;
        break;
      }
    }
  }

  if (isSuccessful) {
    try {
      if (trip !== "") {
        ws.send("B" + uid + "%" + trip);
      } else {
        ws.send("B" + uid);
      }

      sendUserList(index, ws);

      var user = new User(ws, uid, trip, name);
      roomList[index].userList.push(user);

      var ip = user.ws.upgradeReq && user.ws.upgradeReq.headers ? user.ws.upgradeReq.headers["x-forwarded-for"] : null;
      db.upsertUser({ trip: trip || uid, uid: uid, displayName: name, ip: ip });

      if (user.trip !== "") {
        roomList[index]._broadcast("D" + user.uid + "%" + user.trip);
      } else {
        roomList[index]._broadcast("D" + user.uid);
      }
      console.log(
        `login successfull: <${user.uid}> <TRIP:${trip}> from <${user.ws.upgradeReq.headers["x-forwarded-for"]}>`
      );

      if (roomList[index].owner !== null) {
        ws.send("F" + roomList[index].owner.uid);
      }

      if (roomList[index].restoredFromPostgres) {
        ws.send("H? orange PostgreSQLの保存状態から復帰した卓です。状態に違和感があれば管理者に確認してください。");
      }
    } catch (e) {}
  } else {
    try {
      ws.send("C");
    } catch (e) {}
  }
};

var wss = new WebSocketServer({ server: server });

wss.on("connection", function (ws) {
  ws.on("close", function () {
    var user = null;

    var i;
    var len1 = roomList.length;
    for (i = 0; i < len1; i++) {
      var j;
      var len2 = roomList[i].userList.length;
      for (j = 0; j < len2; j++) {
        if (ws === roomList[i].userList[j].ws) {
          user = roomList[i].userList[j];
          roomList[i].removeUser(user);
          break;
        }
      }

      if (user !== null) {
        break;
      }
    }
  });

  ws.on("message", function (message) {
    var index = message.charCodeAt(0);

    message = message.substring(1);

    var i;
    var len1;

    if (index === 100) {
      var buff = String.fromCharCode(100);

      len1 = roomList.length;
      for (i = 0; i < len1; i++) {
        buff += roomList[i].userList.length + " ";
        buff += roomList[i].symbol + " ";

        if (roomList[i].isPlaying) {
          buff += "p ";
        } else {
          buff += "r ";
        }
        if (roomList[i].owner) {
          buff += "l";
        } else {
          buff += "u";
        }

        if (i < len1 - 1) {
          buff += " ";
        }
      }

      try {
        ws.send(buff);
      } catch (e) {}

      return;
    } else if (index >= roomList.length || message.length === 0) {
      return;
    }

    var user = null;

    len1 = roomList[index].userList.length;
    for (i = 0; i < len1; i++) {
      if (ws === roomList[index].userList[i].ws) {
        user = roomList[index].userList[i];
        break;
      }
    }

    var param;

    if (user === null) {
      switch (message[0]) {
        case "a":
          sendUserList(index, ws);
          break;
        case "b":
          login(index, ws, message);
          break;
        case "z":
          adminMessage(ws, message);
          break;
      }
    } else {
      switch (message[0]) {
        case "c":
          param = splitSyntaxType1(message);

          if (param.length > 1 && param[0] === "@") {
            var uid = param.split(" ")[0].slice(1);
            roomList[index].mention(user.uid, uid, "orange", param);
          } else {
            roomList[index].onChat(user, param);

            if (param.length > 1 && param[0] === "/") {
              roomList[index].onCommand(user, param.split(" "));
            }
          }

          break;
        case "d":
          param = splitSyntaxType1(message);

          roomList[index].onMessage(user.uid, param);
          break;
        case "e":
          roomList[index].resetChatCount(user.uid);
          if (
            user &&
            roomList[index].chatCount[user.uid] &&
            roomList[index].chatCount[user.uid].count > 5
          ) {
            roomList[index].removeUser(user);
            roomList[index].chat(
              "?",
              "deeppink",
              user.uid + "を追放しました。"
            );
          }
          roomList[index].chat(
            "?",
            "deeppink",
            user.uid + "がベルを鳴らしました。"
          );
          roomList[index]._broadcast("J");
          break;
        case "f":
          roomList[index].resetChatCount(user.uid);
          if (
            user &&
            roomList[index].chatCount[user.uid] &&
            roomList[index].chatCount[user.uid].count > 5
          ) {
            roomList[index].removeUser(user);
            roomList[index].chat(
              "?",
              "deeppink",
              user.uid + "を追放しました。"
            );
          }
          roomList[index].chat(
            "?",
            "deeppink",
            user.uid +
              "のダイス=>[" +
              MersenneTwister.Share.nextInt(1, 100) +
              "]"
          );
          break;
        case "g":
          roomList[index].onSilentGrant(user);
          break;
      }
    }
  });
});

const port = process.env.PORT || 5000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on ${port}`);
});

process.on("uncaughtException", function (e) {
  console.log("uncaughtException =>", e);
});
