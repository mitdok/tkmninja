var Room = require('../Room');
var MersenneTwister = require('../MersenneTwister');
var Game = require('./Game');
var Const = require('./Const');
var State = Const.State;
var Phase = Const.Phase;
var Sound = Const.Sound;
var Index = Const.Index;
var Card = Const.Card;
var Mode = Const.Mode;
var Tactics = Const.Tactics;
var FONT_COLOR = Const.FONT_COLOR;
var COLOR_NAME = Const.COLOR_NAME;

var BattleRaiso = function (roomId, redis, isAuth = false) {
    this.initialize('b', roomId, redis);

    this.game = new Game();
    this.mt = new MersenneTwister();
    this.timer = null;
    this.isAuth = isAuth;
    this.clockTimer = null;

    this.redis.get(`room-${this.roomId}`).then((prev) => {
        if (prev) {
            this.isPlaying = JSON.parse(prev).isPlaying;
            Game.copy(this.game, JSON.parse(prev).game);
            if (Phase.NONE !== JSON.parse(prev).game.phase) {
                this.startTimer(this.game);
                this.startBroadcastTimer(this.game);
            }
        } else {
            Game.clear(this.game);
        }
    });
};

BattleRaiso.prototype = new Room();

BattleRaiso.prototype.split = function (source) {
    return source.slice(1).split(' ');
};

BattleRaiso.prototype.reset = function () {
    this.isPlaying = false;
    this.stopTimer();
    this.stopBroadcastTimer();

    Game.clear(this.game);

    this.broadcast(JSON.stringify(this.game));
};

BattleRaiso.prototype.onCommand = function (user, message) {
    this.basicCommand(user, message);

    switch (message[0]) {
        case '/basic':
            if (this.isPlaying) {
                this.chat('?', 'deeppink', 'プレイ中には変更できません。');
            } else if (this.owner !== user) {
                this.chat('?', 'deeppink', '管理者のみ変更できます。');
            } else {
                this.game.setup = Mode.BASIC;

                this.chat('?', 'deeppink', 'ベーシックモードに変更しました。');

                this.broadcast(JSON.stringify(this.game));
            }
            break;
        case '/advance':
            if (this.isPlaying) {
                this.chat('?', 'deeppink', 'プレイ中には変更できません。');
            } else if (this.owner !== user) {
                this.chat('?', 'deeppink', '管理者のみ変更できます。');
            } else {
                this.game.setup = Mode.ADVANCE;

                this.chat('?', 'deeppink', 'アドバンスモードに変更しました。');

                this.broadcast(JSON.stringify(this.game));
            }
            break;
        case '/timeout':
            if (this.isPlaying) {
                this.chat('?', 'deeppink', 'プレイ中には変更できません。');
            } else if (this.owner !== user) {
                this.chat('?', 'deeppink', '管理者のみ変更できます。');
            } else {
                var t = parseInt(message[1]);
                if (isNaN(t) || t >= 100) {
                    this.chat('?', 'deeppink', '0 ~ 99の数値を入力してください(0は無制限)');
                } else {
                    this.game.timeout = t;
                    var str = t === 0 ? '無制限' : t + '分';
                    this.chat('?', 'deeppink', '持ち時間を' + str + 'に変更しました。');

                    this.broadcast(JSON.stringify(this.game));
                }
            }

            break;
    }
};

BattleRaiso.prototype.onChat = function (user, message) {
    var playerList = this.game.playerList;
    var color = 'white';

    var i;
    var len1 = playerList.length;
    for (i = 0; i < len1; i++) {
        if (playerList[i].uid === user.uid) {
            color = FONT_COLOR[i];
            break;
        }
    }

    this.chat(user.uid, color, message.split('<').join('&lt;').split('>').join('&gt;'));
};

BattleRaiso.prototype.onMessage = function (uid, message) {
    if (message[0] === 'a') {
        this.unicast(uid, JSON.stringify(this.game));
    } else {
        if (this.game.state === State.READY) {
            switch (message[0]) {
                case 'b':
                    (function (that) {
                        var game = that.game;
                        var playerList = game.playerList;

                        var i;
                        var len1 = playerList.length;
                        for (i = 0; i < len1; i++) {
                            var player = playerList[i];

                            if (player.uid === '') {
                                player.uid = uid;
                                game.sound = Sound.JOIN;
                                break;
                            }
                        }
                    })(this);
                    break;
                case 'c':
                    (function (that) {
                        var playerList = that.game.playerList;

                        var i;
                        var len1 = playerList.length;
                        for (i = 0; i < len1; i++) {
                            var player = playerList[i];

                            if (player.uid === uid) {
                                player.uid = '';
                            }
                        }
                    })(this);
                    break;
                case 'd':
                    (function (that) {
                        var game = that.game;
                        var mt = that.mt;
                        var playerList = game.playerList;

                        if (playerList[0].uid !== '' && playerList[1].uid !== '') {
                            Game.start(game, mt);

                            var active = game.active;
                            that.startTimer(game);
                            that.startBroadcastTimer(game);

                            that.chat(
                                '?',
                                'orange',
                                '--「' + playerList[active].uid + '(' + COLOR_NAME[active] + ')」ターン--'
                            );

                            that.isPlaying = true;
                            game.sound = Sound.OPENING;
                        }
                    })(this);
                    break;
            }
        } else {
            switch (message[0]) {
                case 'e':
                    (function (that) {
                        var game = that.game;

                        if (
                            game.phase === Phase.STARTUP ||
                            game.phase === Phase.TROOP ||
                            game.phase === Phase.ALEXANDER ||
                            game.phase === Phase.DARIUS ||
                            game.phase === Phase.COMPANION ||
                            game.phase === Phase.SHIELD ||
                            game.phase === Phase.SCOUT1 ||
                            game.phase === Phase.REDEPLOY1 ||
                            game.phase === Phase.DESERTER ||
                            game.phase === Phase.TRAITOR1 ||
                            game.phase === Phase.DRAW
                        ) {
                            var index = parseInt(that.split(message)[0]);

                            that.chat('?', 'deeppink', '**' + (index + 1) + '列目 旗獲得**');
                            game.log.flag.push(index + 1);

                            var active = game.active;
                            game.flagList[index] = active;

                            if (Game.isFinish(that.game)) {
                                var playerList = game.playerList;
                                game.log.afterHand = game.playerList[game.active].hand.map((c) => Game.getCardName(c));
                                game.playLog.push(game.log);

                                that.chat('?', 'deeppink', '++勝利 おめでとう++');

                                that.chat('?', 'deeppink', playerList[active].uid + '(' + COLOR_NAME[active] + ')');

                                playerList[0].uid = playerList[1].uid = '';

                                game.state = State.READY;
                                that.isPlaying = false;
                                that.stopTimer(game);
                                that.stopBroadcastTimer(game);

                                game.sound = Sound.ENDING;
                            } else {
                                game.sound = Sound.GET;
                            }
                        }
                    })(this);
                    break;
                case 'f':
                    (function (that) {
                        var game = that.game;

                        if (
                            game.phase === Phase.STARTUP ||
                            game.phase === Phase.TROOP ||
                            game.phase === Phase.ALEXANDER ||
                            game.phase === Phase.DARIUS ||
                            game.phase === Phase.COMPANION ||
                            game.phase === Phase.SHIELD ||
                            game.phase === Phase.FOG ||
                            game.phase === Phase.MUD ||
                            game.phase === Phase.SCOUT1 ||
                            game.phase === Phase.REDEPLOY1 ||
                            game.phase === Phase.DESERTER ||
                            game.phase === Phase.TRAITOR1
                        ) {
                            game.playing = parseInt(that.split(message)[0]);

                            switch (game.playerList[game.active].hand[game.playing]) {
                                case Tactics.ALEXANDER:
                                    game.phase = Phase.ALEXANDER;
                                    break;
                                case Tactics.DARIUS:
                                    game.phase = Phase.DARIUS;
                                    break;
                                case Tactics.COMPANION:
                                    game.phase = Phase.COMPANION;
                                    break;
                                case Tactics.SHIELD:
                                    game.phase = Phase.SHIELD;
                                    break;
                                case Tactics.FOG:
                                    game.phase = Phase.FOG;
                                    break;
                                case Tactics.MUD:
                                    game.phase = Phase.MUD;
                                    break;
                                case Tactics.SCOUT:
                                    game.phase = Phase.SCOUT1;
                                    break;
                                case Tactics.REDEPLOY:
                                    game.phase = Phase.REDEPLOY1;
                                    break;
                                case Tactics.DESERTER:
                                    game.phase = Phase.DESERTER;
                                    break;
                                case Tactics.TRAITOR:
                                    game.phase = Phase.TRAITOR1;
                                    break;
                                default:
                                    game.phase = Phase.TROOP;
                                    break;
                            }
                        }
                    })(this);
                    break;
                case 'g':
                    (function (that) {
                        var game = that.game;

                        if (
                            game.phase === Phase.TROOP ||
                            game.phase === Phase.ALEXANDER ||
                            game.phase === Phase.DARIUS ||
                            game.phase === Phase.COMPANION ||
                            game.phase === Phase.SHIELD
                        ) {
                            var active = game.active;
                            var activePlayer = game.playerList[active];
                            var playing = game.playing;
                            var index = parseInt(that.split(message)[0]);
                            var activeHand = activePlayer.hand;
                            var playingCard = activeHand[playing];

                            game.log.playingCard = Game.getCardName(playingCard);
                            game.log.index = index + 1;

                            activePlayer.field[index].push(playingCard);

                            var before = game.before;

                            before.idx = active;
                            before.x = activePlayer.field[index].length - 1;
                            before.y = index;

                            if ((playingCard & 0xff00) !== 0x0600) {
                                that.chat('?', 'deeppink', '部隊カードをプレイしました。');

                                game.stock[((playingCard & 0xff00) >> 8) * 10 + (playingCard & 0x00ff)] = Index.NONE;
                            } else {
                                switch (playingCard) {
                                    case Tactics.ALEXANDER:
                                    case Tactics.DARIUS:
                                        that.chat('?', 'deeppink', '隊長をプレイしました。');

                                        activePlayer.leader++;
                                        break;
                                    case Tactics.COMPANION:
                                        that.chat('?', 'deeppink', '援軍をプレイしました。');
                                        break;
                                    case Tactics.SHIELD:
                                        that.chat('?', 'deeppink', '盾をプレイしました。');
                                        break;
                                }

                                activePlayer.count++;
                            }

                            activeHand.splice(game.playing, 1);
                            game.playing = Index.NONE;

                            if (game.troopDeck.length > 0 || game.tacticsDeck.length > 0) {
                                game.phase = Phase.DRAW;
                                game.sound = Sound.BUILD;
                            } else {
                                Game.nextTurn(game);

                                that.chat(
                                    '?',
                                    'orange',
                                    '--「' +
                                        game.playerList[game.active].uid +
                                        '(' +
                                        COLOR_NAME[game.active] +
                                        ')」ターン--'
                                );

                                game.sound = Sound.PASS;
                            }
                        }
                    })(this);
                    break;
                case 'h':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.FOG) {
                            var playerList = game.playerList;
                            var i = that.split(message)[0];

                            game.log.playingCard = Game.getCardName(playerList[game.active].hand[game.playing]);
                            game.log.index = i + 1;

                            that.chat('?', 'deeppink', '霧をプレイしました。');

                            playerList[game.active].count++;
                            game.weather[i]++;
                            playerList[game.active].hand.splice(game.playing, 1);
                            game.playing = Index.NONE;

                            if (game.troopDeck.length > 0 || game.tacticsDeck.length > 0) {
                                game.phase = Phase.DRAW;
                                game.sound = Sound.BUILD;
                            } else {
                                Game.nextTurn(game);

                                that.chat(
                                    '?',
                                    'orange',
                                    '--「' +
                                        game.playerList[game.active].uid +
                                        '(' +
                                        COLOR_NAME[game.active] +
                                        ')」ターン--'
                                );

                                game.sound = Sound.PASS;
                            }

                            game.before.idx = game.before.x = game.before.y = Index.NONE;
                        }
                    })(this);
                    break;
                case 'i':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.MUD) {
                            var activePlayer = game.playerList[game.active];
                            var index = that.split(message)[0];

                            game.log.playingCard = Game.getCardName(activePlayer.hand[game.playing]);
                            game.log.index = parseInt(index) + 1;

                            that.chat('?', 'deeppink', '泥をプレイしました。');

                            activePlayer.count++;
                            game.weather[index] += 2;
                            game.size[index] = 4;
                            activePlayer.hand.splice(game.playing, 1);
                            game.playing = Index.NONE;

                            if (game.troopDeck.length > 0 || game.tacticsDeck.length > 0) {
                                game.phase = Phase.DRAW;
                            } else {
                                Game.nextTurn(game);

                                that.chat(
                                    '?',
                                    'orange',
                                    '--「' +
                                        game.playerList[game.active].uid +
                                        '(' +
                                        COLOR_NAME[game.active] +
                                        ')」ターン--'
                                );

                                game.sound = Sound.PASS;
                            }

                            game.before.idx = game.before.x = game.before.y = Index.NONE;
                            game.sound = Sound.BUILD;
                        }
                    })(this);
                    break;
                case 'j':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.SCOUT1 || game.phase === Phase.SCOUT2) {
                            var activePlayer = game.playerList[game.active];

                            if (game.phase === Phase.SCOUT1) {
                                that.chat('?', 'deeppink', '偵察をプレイしました。');
                                game.log.playingCard = Game.getCardName(activePlayer.hand[game.playing]);

                                activePlayer.count++;
                                Game.discard(game);

                                game.phase = Phase.SCOUT2;
                            }

                            var card = parseInt(that.split(message)[0]);
                            var activeHand = activePlayer.hand;
                            var troopDeck = game.troopDeck;
                            var tacticsDeck = game.tacticsDeck;

                            if (card === Card.TROOP) {
                                that.chat('?', 'deeppink', '部隊カード ドロー。');

                                activeHand.push(troopDeck.shift());
                            } else {
                                that.chat('?', 'deeppink', '戦術カード ドロー。');

                                activeHand.push(tacticsDeck.shift());
                            }

                            if (activeHand.length >= 9 || (troopDeck.length === 0 && tacticsDeck.length === 0)) {
                                game.phase = Phase.SCOUT3;

                                if (activeHand.length <= 7) {
                                    Game.nextTurn(game);

                                    that.chat(
                                        '?',
                                        'orange',
                                        '--「' +
                                            game.playerList[game.active].uid +
                                            '(' +
                                            COLOR_NAME[game.active] +
                                            ')」ターン--'
                                    );

                                    game.sound = Sound.PASS;
                                }
                            } else {
                                game.sound = Sound.BUILD;
                            }
                        }
                    })(this);
                    break;
                case 'k':
                    (function (that) {
                        var game = that.game;
                        var activeHand = game.playerList[game.active].hand;
                        var index = parseInt(that.split(message)[0]);

                        if (game.phase === Phase.SCOUT3 && activeHand.length > 7 && activeHand.length > index) {
                            if ((activeHand[index] & 0xff00) === 0x0600) {
                                that.chat('?', 'deeppink', '戦術カード デッキトップ。');

                                game.tacticsDeck.unshift(activeHand[index]);
                            } else {
                                that.chat('?', 'deeppink', '部隊カード デッキトップ。');

                                game.troopDeck.unshift(activeHand[index]);
                            }

                            activeHand.splice(index, 1);

                            if (activeHand.length <= 7) {
                                game.before.idx = game.before.x = game.before.y = Index.NONE;
                                Game.nextTurn(game);
                                that.chat(
                                    '?',
                                    'orange',
                                    '--「' +
                                        game.playerList[game.active].uid +
                                        '(' +
                                        COLOR_NAME[game.active] +
                                        ')」ターン--'
                                );
                                game.sound = Sound.PASS;
                            } else {
                                game.sound = Sound.BUILD;
                            }
                        }
                    })(this);
                    break;
                case 'l':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.REDEPLOY1) {
                            var param = that.split(message);

                            that.chat('?', 'deeppink', '再配置をプレイしました。');
                            game.log.playingCard = Game.getCardName(game.playerList[game.active].hand[game.playing]);

                            game.playerList[game.active].count++;

                            var target = game.target;

                            target.y = parseInt(param[0]);
                            target.x = parseInt(param[1]);

                            that.chat('?', 'deeppink', target.y + 1 + '列目から対象にしました。');

                            game.phase = Phase.REDEPLOY2;
                            game.sound = Sound.BUILD;
                        }
                    })(this);
                    break;
                case 'm':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.REDEPLOY2) {
                            var activePlayer = game.playerList[game.active];
                            var activeTalon = activePlayer.talon;
                            var target = game.target;
                            var activeField = activePlayer.field;
                            var targetField = activeField[target.y];
                            var targetCard = targetField[target.x];
                            var before = game.before;
                            var index = parseInt(that.split(message)[0]);

                            game.log.targetCard = Game.getCardName(targetCard);
                            game.log.move = {
                                before: target.y + 1,
                                after: index + 1,
                            };

                            if (index === Index.NONE) {
                                that.chat('?', 'deeppink', target.y + 1 + '列目から除外しました。');

                                activeTalon.push(targetCard);

                                targetField.splice(target.x, 1);
                                before.idx = before.x = before.y = Index.NONE;
                            } else {
                                activeField[index].push(targetCard);

                                that.chat('?', 'deeppink', index + 1 + '列目に移動しました。');

                                targetField.splice(target.x, 1);

                                before.idx = game.active;
                                before.x = activeField[index].length - 1;
                                before.y = index;
                            }

                            target.y = target.x = Index.NONE;
                            Game.discard(game);

                            if (game.troopDeck.length > 0 || game.tacticsDeck.length > 0) {
                                game.phase = Phase.DRAW;
                                game.sound = Sound.BUILD;
                            } else {
                                Game.nextTurn(game);
                                that.chat(
                                    '?',
                                    'orange',
                                    '--「' +
                                        game.playerList[game.active].uid +
                                        '(' +
                                        COLOR_NAME[game.active] +
                                        ')」ターン--'
                                );
                                game.sound = Sound.PASS;
                            }
                        }
                    })(this);
                    break;
                case 'n':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.DESERTER) {
                            var active = game.active;
                            var activePlayer = game.playerList[active];
                            var inactivePlayer = game.playerList[active === 0 ? 1 : 0];
                            var param = that.split(message);
                            var y = parseInt(param[0]);
                            var x = parseInt(param[1]);

                            that.chat('?', 'deeppink', '脱走をプレイしました。');
                            game.log.playingCard = Game.getCardName(activePlayer.hand[game.playing]);
                            game.log.targetCard = Game.getCardName(inactivePlayer.field[y][x]);
                            game.log.move = { before: y + 1, after: 0 };

                            activePlayer.count++;

                            that.chat('?', 'deeppink', y + 1 + '列目から除外しました。');

                            inactivePlayer.talon.push(inactivePlayer.field[y][x]);
                            inactivePlayer.field[y].splice(x, 1);

                            var before = game.before;

                            before.idx = before.x = before.y = Index.NONE;

                            Game.discard(game);

                            if (game.troopDeck.length > 0 || game.tacticsDeck.length > 0) {
                                game.phase = Phase.DRAW;
                                game.sound = Sound.BUILD;
                            } else {
                                Game.nextTurn(game);

                                that.chat(
                                    '?',
                                    'orange',
                                    '--「' +
                                        game.playerList[game.active].uid +
                                        '(' +
                                        COLOR_NAME[game.active] +
                                        ')」ターン--'
                                );

                                game.sound = Sound.PASS;
                            }
                        }
                    })(this);
                    break;
                case 'o':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.TRAITOR1) {
                            var param = that.split(message);

                            that.chat('?', 'deeppink', '裏切りをプレイしました。');
                            game.log.playingCard = Game.getCardName(game.playerList[game.active].hand[game.playing]);

                            game.playerList[game.active].count++;

                            var target = game.target;

                            target.y = parseInt(param[0]);
                            target.x = parseInt(param[1]);

                            that.chat('?', 'deeppink', target.y + 1 + '列目から対象にしました。');

                            game.phase = Phase.TRAITOR2;
                            game.sound = Sound.BUILD;
                        }
                    })(this);
                    break;
                case 'p':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.TRAITOR2) {
                            var active = game.active;
                            var activePlayer = game.playerList[active];
                            var inactivePlayer = game.playerList[active === 0 ? 1 : 0];
                            var index = parseInt(that.split(message)[0]);
                            var activeField = activePlayer.field[index];
                            var target = game.target;
                            var inactiveField = inactivePlayer.field[target.y];

                            game.log.targetCard = Game.getCardName(inactiveField[target.x]);
                            game.log.move = {
                                before: target.y + 1,
                                after: index + 1,
                            };

                            that.chat('?', 'deeppink', index + 1 + '列目に移動しました。');

                            activeField.push(inactiveField[target.x]);

                            var before = game.before;

                            before.idx = active;
                            before.x = activeField.length - 1;
                            before.y = index;
                            inactiveField.splice(target.x, 1);
                            target.y = target.x = Index.NONE;

                            Game.discard(game);

                            if (game.troopDeck.length > 0 || game.tacticsDeck.length > 0) {
                                game.phase = Phase.DRAW;
                                game.sound = Sound.BUILD;
                            } else {
                                Game.nextTurn(game);

                                that.chat(
                                    '?',
                                    'orange',
                                    '--「' +
                                        game.playerList[game.active].uid +
                                        '(' +
                                        COLOR_NAME[game.active] +
                                        ')」ターン--'
                                );

                                game.sound = Sound.PASS;
                            }
                        }
                    })(this);
                    break;
                case 'q':
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.DRAW) {
                            var card = parseInt(that.split(message)[0]);

                            if (card === Card.TROOP) {
                                that.chat('?', 'deeppink', '部隊カードをドロー。');

                                game.playerList[game.active].hand.push(game.troopDeck.shift());
                            } else {
                                that.chat('?', 'deeppink', '戦術カードをドロー。');

                                game.playerList[game.active].hand.push(game.tacticsDeck.shift());
                            }

                            game.log.draw = Game.getCardName(
                                game.playerList[game.active].hand[game.playerList[game.active].hand.length - 1]
                            );

                            Game.nextTurn(game);

                            that.chat(
                                '?',
                                'orange',
                                '--「' +
                                    game.playerList[game.active].uid +
                                    '(' +
                                    COLOR_NAME[game.active] +
                                    ')」ターン--'
                            );

                            game.sound = Sound.PASS;
                        }
                    })(this);
                    break;
                case 'r':
                    (function (that) {
                        var game = that.game;

                        if (
                            game.phase === Phase.STARTUP ||
                            game.phase === Phase.ALEXANDER ||
                            game.phase === Phase.DARIUS ||
                            game.phase === Phase.COMPANION ||
                            game.phase === Phase.SHIELD ||
                            game.phase === Phase.FOG ||
                            game.phase === Phase.MUD ||
                            game.phase === Phase.SCOUT1 ||
                            game.phase === Phase.REDEPLOY1 ||
                            game.phase === Phase.DESERTER ||
                            game.phase === Phase.TRAITOR1
                        ) {
                            that.chat('?', 'deeppink', 'パスしました。');
                            game.log.pass = true;

                            Game.nextTurn(game);

                            that.chat(
                                '?',
                                'orange',
                                '--「' +
                                    game.playerList[game.active].uid +
                                    '(' +
                                    COLOR_NAME[game.active] +
                                    ')」ターン--'
                            );

                            game.sound = Sound.PASS;
                        }
                    })(this);
                    break;
            }
        }

        this.broadcast(JSON.stringify(this.game));
        this.game.sound = '';
    }
};

BattleRaiso.prototype.stopTimer = function (game) {
    if (this.timer) {
        clearInterval(this.timer);
    }
    this.timer = null;
};

BattleRaiso.prototype.startTimer = function (game) {
    this.stopTimer(game);
    this.timer = setInterval(() => {
        game.playerList[game.active].time++;
        if (
            this.timer &&
            game.timeout !== 0 &&
            game.playerList[game.active].time >= game.timeout * 60 &&
            this.isPlaying
        ) {
            game.state = State.READY;
            this.isPlaying = false;
            game.sound = Sound.ENDING;
            game.phase = Phase.NONE;
            game.playLog.push(game.log);
            var playerList = game.playerList;
            var looser = game.active;
            var winner = game.active === 0 ? 1 : 0;
            var lose_uid = playerList[looser].uid;
            var win_uid = playerList[winner].uid;

            playerList[0].uid = playerList[1].uid = '';
            this.broadcast(JSON.stringify(game));
            this.game.sound = '';
            this.stopTimer(game);
            this.stopBroadcastTimer(game);

            this.chat('?', 'orange', '--「' + lose_uid + '(' + COLOR_NAME[looser] + ')」時間切れ--');
            this.chat('?', 'deeppink', '++勝利 おめでとう++');
            this.chat('?', 'deeppink', win_uid + '(' + COLOR_NAME[winner] + ')');
        }
    }, 1000);
};

BattleRaiso.prototype.stopBroadcastTimer = function (game) {
    if (this.clockTimer) {
        clearInterval(this.clockTimer);
    }
    this.clockTimer = null;
};

BattleRaiso.prototype.startBroadcastTimer = function (game) {
    this.stopBroadcastTimer(game);
    this.clockTimer = setInterval(() => {
        this.broadcast(JSON.stringify(game), false);
    }, 1000);
};

module.exports = BattleRaiso;
