var Player = require('./Player');
var Const = require('./Const');
const { Tactics } = require('./Const');
var Index = Const.Index;
var State = Const.State;
var Phase = Const.Phase;
var Mode = Const.Mode;
var CARD_COLOR = Const.CARD_COLOR;

var Game = function () {};

Game.clear = function (game) {
    game.setup = Mode.ADVANCE;
    game.state = State.READY;
    game.sound = '';
    game.phase = Phase.NONE;
    game.active = Index.NONE;
    game.playing = Index.NONE;
    game.target = { x: Index.NONE, y: Index.NONE };
    game.troopDeck = [];
    game.tacticsDeck = [];
    game.flagList = [];
    game.size = [];
    game.weather = [];
    game.stock = [];
    game.before = { idx: Index.NONE, x: Index.NONE, y: Index.NONE };
    game.playLog = [];
    game.log = {};
    game.turn = 1;
    game.timeout = 0;

    var playerList = (game.playerList = [new Player(), new Player()]);

    Player.clear(playerList[0]);
    Player.clear(playerList[1]);
};
Game.copy = function (game, prev) {
    game.setup = prev.setup;
    game.state = prev.state;
    game.sound = '';
    game.phase = prev.phase;
    game.active = prev.active;
    game.playing = prev.playing;
    game.target = prev.target || { x: Index.NONE, y: Index.NONE };
    game.troopDeck = prev.troopDeck || [];
    game.tacticsDeck = prev.tacticsDeck || [];
    game.flagList = prev.flagList || [];
    game.size = prev.size || [];
    game.weather = prev.weather || [];
    game.stock = prev.stock || [];
    game.before = prev.before || {
        idx: Index.NONE,
        x: Index.NONE,
        y: Index.NONE,
    };
    game.playLog = prev.playLog || [];
    game.log = prev.log || {};
    game.turn = prev.turn || 1;
    game.timeout = prev.timeout || 0;

    var playerList = (game.playerList = [new Player(), new Player()]);

    Player.copy(playerList[0], prev.playerList[0]);
    Player.copy(playerList[1], prev.playerList[1]);
};

Game.start = function (game, mt) {
    game.state = State.PLAYING;
    game.sound = '';
    game.phase = Phase.STARTUP;
    game.active = 0;
    game.playing = Index.NONE;
    game.target.x = game.target.y = Index.NONE;
    game.before.idx = game.before.x = game.before.y = Index.NONE;
    game.playLog = [];
    game.turn = 1;

    var stock = game.stock;
    stock.length = 0;

    var i, j;
    for (i = 0; i < 6; i++) {
        for (j = 0; j < 10; j++) {
            stock.push(j);
        }
    }

    var flagList = game.flagList;
    var size = game.size;
    var weather = game.weather;

    flagList.length = size.length = weather.length = 0;
    for (i = 0; i < 9; i++) {
        flagList.push(Index.NONE);
        size.push(3);
        weather.push(0);
    }

    var playerList = game.playerList;

    Player.start(playerList[0]);
    Player.start(playerList[1]);

    var troopDeck = game.troopDeck;

    troopDeck.length = 0;
    for (i = 0x0000; i < 0x0600; i += 0x0100) {
        for (j = 0x0009; j >= 0x0000; j -= 0x0001) {
            troopDeck.push(i | j);
        }
    }

    var tmp = [];

    while (troopDeck.length > 0) {
        i = mt.nextInt(troopDeck.length);
        tmp.push(troopDeck[i]);
        troopDeck.splice(i, 1);
    }
    while (tmp.length > 0) {
        i = mt.nextInt(tmp.length);
        troopDeck.push(tmp[i]);
        tmp.splice(i, 1);
    }

    var tacticsDeck = game.tacticsDeck;

    tacticsDeck.length = 0;
    for (i = 0x0009; i >= 0x0000; i -= 0x0001) {
        tacticsDeck.push(0x0600 | i);
    }

    while (tacticsDeck.length > 0) {
        i = Math.floor(Math.random() * tacticsDeck.length);
        tmp.push(tacticsDeck[i]);
        tacticsDeck.splice(i, 1);
    }
    while (tmp.length > 0) {
        i = Math.floor(Math.random() * tmp.length);
        tacticsDeck.push(tmp[i]);
        tmp.splice(i, 1);
    }

    for (i = 0; i < 7; i++) {
        playerList[0].hand.push(troopDeck.shift());
        playerList[1].hand.push(troopDeck.shift());
    }

    game.log = {
        uid: playerList[0].uid,
        turn: game.turn,
        beforeHand: playerList[0].hand.map((c) => Game.getCardName(c)),
        afterHand: [],
        flag: [],
    };
};

Game.discard = function (game) {
    var playerList = game.playerList;
    var active = game.active;
    var playing = game.playing;
    var talon = playerList[active].talon;
    var hand = playerList[active].hand;

    talon.push(hand[playing]);
    hand.splice(playing, 1);

    game.playing = Index.NONE;
};

Game.nextTurn = function (game) {
    game.log.afterHand = game.playerList[game.active].hand.map((c) => Game.getCardName(c));
    var dt = new Date();
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1).padStart(2, '0');
    var d = String(dt.getDate()).padStart(2, '0');
    var result = y + m + d;
    game.log.meta = {
        date: result,
        player1: game.playerList[0].uid,
        player2: game.playerList[1].uid,
    };
    game.playLog.push(game.log);
    game.active = game.active === 0 ? 1 : 0;
    game.log = {
        turn: ++game.turn,
        uid: game.playerList[game.active].uid,
        beforeHand: game.playerList[game.active].hand.map((c) => Game.getCardName(c)),
        afterHand: [],
        flag: [],
    };
    game.phase = Phase.STARTUP;
    game.playing = Index.NONE;
};

Game.isFinish = function (game) {
    var active = game.active;
    var flagList = game.flagList;

    var i,
        sequence = 0,
        count = 0;
    var len1 = flagList.length;
    for (i = 0; i < len1; i++) {
        if (flagList[i] === active) {
            sequence++;
            count++;
        } else {
            sequence = 0;
        }
        if (sequence >= 3 || count >= 5) {
            return true;
        }
    }

    return false;
};

Game.getCardName = function (card) {
    var color = (card & 0xff00) >> 8;
    var number = (card & 0x00ff) + 1;
    if (color < 6) {
        return CARD_COLOR[color] + number;
    }

    switch (card) {
        case Tactics.ALEXANDER:
        case Tactics.DARIUS:
            return '隊長';
        case Tactics.COMPANION:
            return '援軍';
        case Tactics.SHIELD:
            return '盾';
        case Tactics.FOG:
            return '霧';
        case Tactics.MUD:
            return '泥';
        case Tactics.SCOUT:
            return '偵察';
        case Tactics.REDEPLOY:
            return '再配置';
        case Tactics.DESERTER:
            return '脱走';
        case Tactics.TRAITOR:
            return '裏切り';
    }
};

module.exports = Game;
