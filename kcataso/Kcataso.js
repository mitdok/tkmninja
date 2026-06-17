var Room = require('../Room');
var MersenneTwister = require('../MersenneTwister');
var Game = require('./Game');
var Dice = require('./Dice');
var Const = require('./Const');
const { KnightRank, SETTLEMENT_LINK, KnightStatus, CARD_NAME } = require('./Const');
const { loseResource, gainResource } = require('./Game');
var Option = Const.Option;
var State = Const.State;
var Phase = Const.Phase;
var Sound = Const.Sound;
var Index = Const.Index;
var Resource = Const.Resource;
var Land = Const.Land;
var SettlementRank = Const.SettlementRank;
var Card = Const.Card;
var Development = Const.Development;
var FONT_COLOR = Const.FONT_COLOR;
var COLOR_NAME = Const.COLOR_NAME;
var LAND_LINK = Const.LAND_LINK;
var DEVELOP_NAME = Const.DEVELOP_NAME;
var RESOURCE_NAME = Const.RESOURCE_NAME;
var Event = Const.Event;

var Kcataso = function (roomId, redis, isAuth = false) {
    this.initialize('c', roomId, redis);
    
    this.game = new Game();
    this.dice = new Dice();
    this.isAuth = isAuth;
    this.mt = new MersenneTwister();
    
    this.restoreSavedGame((prev) => {
        this.isPlaying = !!prev.isPlaying;
        this.currentGameId = prev.currentGameId || null;
        Game.copy(this.game, prev.game);
        Dice.clear(this.dice, this.mt);
    }).then((source) => {
        if (!source) { Game.clear(this.game); }
        if (source === 'postgres') {
            console.log(`[room-${this.roomId}] restored from PostgreSQL fallback`);
        }
    });
}

Kcataso.prototype = new Room();

Kcataso.prototype.split = function (source) {
    return source.slice(1).split(' ');
}

Kcataso.prototype.reset = function () {
    if (this.isPlaying) { this.finishGameLog(null, 'reset', this.game); }
    this.isPlaying = false;

    Game.clear(this.game);

    this.broadcast(JSON.stringify(this.game));
}

Kcataso.prototype.onCommand = function (user, message) {
    this.basicCommand(user, message);

    switch (message[0]) {
        case '/alphabet':
            if (this.isPlaying) {
                this.chat('?', 'deeppink', 'プレイ中には変更できません。');
            } else {
                this.game.setup = Option.ALPHABET_SETUP;

                this.chat('?', 'deeppink', 'アルファベット配置に変更しました。');

                this.broadcast(JSON.stringify(this.game));
            }
            break;
        case '/random':
            if (this.isPlaying) {
                this.chat('?', 'deeppink', 'プレイ中には変更できません。');
            } else {
                this.game.setup = Option.RANDOM_SETUP;

                this.chat('?', 'deeppink', 'ランダム配置に変更しました。');

                this.broadcast(JSON.stringify(this.game));
            }
            break;
        case '/close':
            if (this.isPlaying) {
                this.chat('?', 'deeppink', 'プレイ中には変更できません。');
            } else {
                this.game.hidden = true;

                this.chat('?', 'deeppink', '市場表示なしに変更しました');

                this.broadcast(JSON.stringify(this.game));
            }
            break;
        case '/open':
            if (this.isPlaying) {
                this.chat('?', 'deeppink', 'プレイ中には変更できません。');
            } else {
                this.game.hidden = false;

                this.chat('?', 'deeppink', '市場表示ありに変更しました');

                this.broadcast(JSON.stringify(this.game));
            }
            break;             
    }
}

Kcataso.prototype.onChat = function (user, message) {
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
    
    this.chat(user.uid, color, (message.split('<').join('&lt;')).split('>').join('&gt;'));
}

Kcataso.prototype.onMessage = function (uid, message) {
    if (message[0] === 'a') { // 接続した際に最初に送信
        this.unicast(uid, JSON.stringify(this.game));
    } else {
        if (this.game.state === State.READY) {
            switch (message[0]) {
                // join the game (着席押下時)
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
                // leave the game (離席押下時)
                case 'c':
                    (function (that) {
                        var playerList = that.game.playerList;

                        var i;
                        var len1 = playerList.length;
                        for (i = 0; i < len1; i++) {
                            var player = playerList[i];
                            
                            if (player.uid === uid) { player.uid = ''; }
                        }
                    })(this);
                    break;
                // start the game
                case 'd':
                    (function (that) {
                        var game = that.game;
                        var mt = that.mt;
                        var playerList = game.playerList;
                        
                        if (
                               playerList[0].uid !== ''
                            && playerList[1].uid !== ''
                            && playerList[2].uid !== ''
                        ) {
                            Game.start(game, mt);
                            Dice.clear(that.dice, mt);
                            that.beginGameLog(game, that.buildParticipants(playerList, COLOR_NAME));

                            var active = game.active;
                            
                            that.chat(
                                  '?'
                                , 'orange'
                                , '--「' + playerList[active].uid + '(' + COLOR_NAME[active] + ')」ターン--'
                            );
                            
                            that.isPlaying = true;
                            game.sound = Sound.OPENING;
                        }
                    })(this);
                    break;
            }
        } else {
            if (Game.hasPriorityUid(this.game, uid)) {
                switch (message[0]) {
                    case 'e': // 取り消し
                        (function (that) {
                            var game = that.game;
                            
                            switch (game.phase) {
                                // case Phase.BUILD_ROAD:
                                // case Phase.BUILD_SETTLEMENT:
                                // case Phase.BUILD_CITY:
                                // case Phase.DOMESTIC_TRADE1:
                                // case Phase.INTERNATIONAL_TRADE:
                                // case Phase.SOLDIER1:
                                // case Phase.MOVE_KNIGHT1:
                                // case Phase.BUILD_KNIGHT:
                                // case Phase.ACTIVATE_KNIGHT:
                                // case Phase.PROMOTE_KNIGHT:
                                // case Phase.MOVE_KNIGHT1:
                                // case Phase.MOVE_ROBBER1:
                                // case Phase.DEVELOPMENT1:
                                // case Phase.USE_CARD:
                                // case Phase.CRANE:
                                // case Phase.ENGINEER:
                                // case Phase.BUILD_CITYWALL:
                                // case Phase.INVENTOR1:
                                // case Phase.INVENTOR2:
                                // case Phase.MEDICINE:
                                //     game.phase = Phase.MAIN;
                                //     break;
                                case Phase.MOVE_KNIGHT2:
                                    game.phase = Phase.MAIN;
                                    game.selectingKnight = Index.NONE;
                                    break;
                                case Phase.DOMESTIC_TRADE3:
                                    var priority = that.game.priority;
                                    var active = that.game.active;
                                    that.chat('?', 'deeppink', `貿易キャンセル`);
                                    priority.length = 0;
                                    priority.push(active);
                                    game.playerList.forEach(p => p.trading = false);
        
                                    game.phase = Phase.MAIN;
                                    break;
                                case Phase.ALCHEMIST:
                                    game.phase = Phase.DICE;
                                    break;
                                case Phase.DIPLOMAT2: // 外交官の再配置をキャンセルした場合に道賞の計算が必要
                                    var i = Game.longestRoad(game);

                                    if (i !== Index.NONE) {
                                        that.chat(
                                            '?'
                                          , FONT_COLOR[i]
                                          , '**' + game.playerList[i].uid + '(' + COLOR_NAME[i] + ')が道賞を獲得しました**'
                                        );
                                        
                                        game.sound = Sound.GET;
                                    }
                                    game.phase = Phase.MAIN;
                                    break;
                                default:
                                    game.phase = Phase.MAIN;
                                    break;
                            }
                        })(this);
                        break;
                    case 'f': // 初期家設置
                        (function (that) {
                            var game = that.game;
                            
                            if (game.phase === Phase.SETUP_SETTLEMENT1) {
                                that.chat('?', 'deeppink', '家を配置しました。');
                                
                                var index = parseInt(that.split(message)[0]);
                                Game.buildSettlement(game, index);
                                
                                game.phase = Phase.SETUP_ROAD1;
                                game.sound = Sound.BUILD;
                            }
                        })(this);
                        break;
                    case 'g': // 初期道設置1
                        (function (that) {
                            var game = that.game;
                            
                            if (game.phase === Phase.SETUP_ROAD1) {
                                that.chat('?', 'deeppink', '道を配置しました。');
                                
                                var index = that.split(message)[0];
                                Game.buildRoad(game, index);
                                
                                if (game.active === game.playerSize - 1) {
                                    game.phase = Phase.SETUP_CITY;
                                } else {
                                    var active = game.active = ++game.active;
                                    
                                    var priority = game.priority;
                                    priority.length = 0;
                                    priority.push(active);
                                    
                                    that.chat(
                                          '?'
                                        , 'orange'
                                        , '--「' + game.playerList[active].uid + '(' + COLOR_NAME[active] + ')」ターン--'
                                    );
                                    
                                    game.phase = Phase.SETUP_SETTLEMENT1;
                                }

                                game.sound = Sound.PASS;
                            }
                        })(this);
                        break;
                    case 'h': // 初期街設置
                        (function (that) {
                            var game = that.game;
                            
                            if (game.phase === Phase.SETUP_CITY) {
                                that.chat('?', 'deeppink', '街を配置しました。');
                                
                                var active = game.active;
                                var index = parseInt(that.split(message)[0]);
                                var secondSettlement = game.playerList[active].secondSettlement = parseInt(index);
                                
                                Game.buildSettlement(game, secondSettlement, true);
                                
                                var landList = game.landList;
                                
                                var i;
                                var len1 = LAND_LINK.length;
                                for (i = 0; i < len1; i++) {
                                    if (landList[i] !== Land.DESERT) {
                                        var j;
                                        var len2 = LAND_LINK[i].length;
                                        for (j = 0; j < len2; j++) {
                                            if (LAND_LINK[i][j] === secondSettlement) {
                                                Game.gainResource(game, active, landList[i], 1);
                                            }
                                        }
                                    }
                                }
                                
                                game.phase = Phase.SETUP_ROAD2;
                                game.sound = Sound.BUILD;
                            }
                        })(this);
                        break;
                    case 'i': // 初期道設置2
                        (function (that) {
                            var game = that.game;
                            
                            if (game.phase === Phase.SETUP_ROAD2) {
                                that.chat('?', 'deeppink', '道を配置しました。');
                                
                                var index = that.split(message)[0];
                                Game.buildRoad(game, index);
                                
                                var active = game.active;
                                if (active === 0) {
                                    game.phase = Phase.DICE;
                                    game.sound = Sound.BUILD;
                                } else {
                                    active = --game.active;
                                    
                                    var priority = game.priority;
                                    priority.length = 0;
                                    priority.push(active);
                                    
                                    that.chat(
                                          '?'
                                        , 'orange'
                                        , '--「' + game.playerList[active].uid + '(' + COLOR_NAME[active] + ')」ターン--'
                                    );
                                    
                                    game.phase = Phase.SETUP_CITY;
                                    game.sound = Sound.PASS;
                                }
                            }
                        })(this);
                        break;
                    case 'j': // ダイス
                        this.diceRoll();
                        break;
                    case 'k': // バースト処理
                        (function (that) {
                            var game = that.game;
                            var param = that.split(message);
                            var color = parseInt(param[0]);
                            var type = param[1];
                            var player = game.playerList[color];
                            
                            if (
                                   (game.phase === Phase.BURST || game.phase === Phase.SABOTEUR || game.phase === Phase.WEDDING)
                                && player.burst > 0
                                && player.resource[type] > 0
                                && player.uid === uid
                            ) {
                                var msg = `${player.uid}(${COLOR_NAME[color]})「${RESOURCE_NAME[type]}」廃棄`;
                                if(game.phase === Phase.WEDDING) {
                                    msg = `${player.uid}(${COLOR_NAME[color]}) 資源進呈`;
                                }
                                that.chat(
                                      '?'
                                    , FONT_COLOR[color]
                                    , msg
                                );
                                
                                Game.loseResource(game, color, type, 1);
                                if(game.phase === Phase.WEDDING) {
                                    Game.gainResource(game, game.active, type, 1);
                                }
                                player.burst--;
                                
                                if (player.burst === 0) {
                                    var priority = game.priority;

                                    var i;
                                    var len1 = priority.length;
                                    for (i = 0; i < len1; i++) {
                                        if (priority[i] === color) { priority.splice(i, 1); }
                                    }
                                    
                                    if (priority.length === 0) {
                                        priority.push(game.active);
                                        if(game.phase === Phase.SABOTEUR || game.phase === Phase.WEDDING) {
                                            game.phase = Phase.MAIN;
                                        } else if (game.phase === Phase.BURST) {
                                            if(game.isBarbarianArrivedOnce) {
                                                game.phase = Phase.ROBBER1;
                                                game.sound = Sound.ROBBER;
                                            } else {
                                                that.discardCardActionOrMain();
                                            }
                                        }
                                    }
                                }
                            }
                        })(this);
                        break;
                    case 'l': // 盗賊移動
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.ROBBER1 || game.phase === Phase.MOVE_ROBBER2 || game.phase === Phase.BISHOP) {
                                that.chat('?', 'deeppink', '盗賊を移動しました。');

                                var robber = game.robber =parseInt(that.split(message)[0]);
                                var settlementList = game.settlementList;
                                var playerList = game.playerList;
                                var active = game.active;
                                var canPillage = false;
                                if (game.phase === Phase.MOVE_ROBBER2) {
                                    Game.deactivateKnight(game, game.selectingKnight);
                                    game.selectingKnight = Index.NONE;
                                }

                                var i;
                                var len1 = LAND_LINK[robber].length;
                                for (i = 0; !canPillage && i < len1; i++) {
                                    var settlement = settlementList[LAND_LINK[robber][i]];
                                    var rank = settlement & 0xff00;
                                    var color = settlement & 0x00ff;
                                    
                                    if (rank !== SettlementRank.NONE && color !== active) {
                                        if (Game.hasResource(playerList[color])) {
                                            canPillage = true;
                                        }
                                    }
                                }
                                if(game.phase === Phase.BISHOP) {
                                    Game.discardCard(game, game.active, Card.BISHOP);
                                    that.pillageAll(game, robber);
                                    game.phase = Phase.MAIN;
                                } else if (canPillage) {
                                    if(game.phase === Phase.ROBBER1) {
                                        game.phase = Phase.ROBBER2;
                                    } else if(game.phase === Phase.MOVE_ROBBER2) {
                                        game.phase = Phase.SOLDIER2;
                                    }
                                } else {
                                    // check card here.
                                    that.discardCardActionOrMain();
                                }

                                game.sound = Sound.BUILD;
                            }
                        })(this);
                        break;
                    case 'm': // 盗賊資源略奪
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.ROBBER2 || game.phase === Phase.SOLDIER2) {
                                var loseColor = that.split(message)[0];
                                var losePlayer = game.playerList[loseColor];

                                that.chat(
                                      '?'
                                    , FONT_COLOR[loseColor]
                                    , '資源の略奪「' + losePlayer.uid + '(' + COLOR_NAME[loseColor] + ')」'
                                );

                                var loseResource = losePlayer.resource;
                                var tmp = [];

                                var i;
                                var len1 = loseResource.length;
                                for (i = 0; i < len1; i++) {
                                    var j;
                                    var len2 = loseResource[i];
                                    for (j = 0; j < len2; j++) { tmp.push(i); }
                                }

                                if(tmp.length === 1) {
                                    i = tmp[0];
                                } else {
                                    i = tmp[that.mt.nextInt(0, tmp.length - 1)];
                                }

                                loseResource[i]--;
                                game.playerList[game.active].resource[i]++;
                                
                                // check card here.
                                that.discardCardActionOrMain();
                                game.sound = Sound.BUILD;
                            }
                        })(this);
                        break;
                    case 'n':
                        if (this.game.phase === Phase.MAIN) { this.game.phase = Phase.BUILD_ROAD; }
                        break;
                    case 'o': // 道設置
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.BUILD_ROAD
                                || game.phase === Phase.ROAD_BUILDING1
                                || game.phase === Phase.ROAD_BUILDING2
                                || game.phase === Phase.DIPLOMAT2
                                ) {
                                that.chat('?', 'deeppink', '道を配置しました。');

                                var active = game.active;

                                var index = that.split(message)[0];
                                Game.buildRoad(game, index);
                                if( game.phase === Phase.ROAD_BUILDING1) {
                                    Game.discardCard(game, game.active, Card.ROAD_BUILDING);
                                    if (game.playerList[game.active].roadStock > 0 && Game.hasCanBuildRoad(game)) {
                                        game.phase = Phase.ROAD_BUILDING2;
                                    } else {
                                        game.phase = Phase.MAIN;
                                    }
                                } else if (game.phase === Phase.ROAD_BUILDING2) {
                                    game.phase = Phase.MAIN;
                                } else if (game.phase === Phase.DIPLOMAT2) {
                                    game.phase = Phase.MAIN;
                                } else {
                                    Game.loseResource(game, active, Resource.BRICK, 1);
                                    Game.loseResource(game, active, Resource.LUMBER, 1);
                                    game.phase = Phase.MAIN;
                                }
                                var i = Game.longestRoad(game);

                                if (i !== Index.NONE) {
                                    that.chat(
                                        '?'
                                      , FONT_COLOR[i]
                                      , '**' + game.playerList[i].uid + '(' + COLOR_NAME[i] + ')が道賞を獲得しました**'
                                    );
                                    
                                    game.sound = Sound.GET;
                                } else {
                                    game.sound = Sound.BUILD;
                                }
                            }
                        })(this);
                        break;
                    case 'p':
                        if (this.game.phase === Phase.MAIN) { this.game.phase = Phase.BUILD_SETTLEMENT; }
                        break;
                    case 'q': // 家設置
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.BUILD_SETTLEMENT) {
                                that.chat('?', 'deeppink', '家を配置しました。');

                                var active = game.active;

                                Game.loseResource(game, active, Resource.BRICK, 1);
                                Game.loseResource(game, active, Resource.WOOL, 1);
                                Game.loseResource(game, active, Resource.GRAIN, 1);
                                Game.loseResource(game, active, Resource.LUMBER, 1);

                                var index = parseInt(that.split(message)[0]);
                                Game.buildSettlement(game, index);
                                
                                game.phase = Phase.MAIN;
                                
                                var i = Game.longestRoad(game);
                                
                                if (i !== Index.NONE) {
                                    that.chat(
                                        '?'
                                      , FONT_COLOR[i]
                                      , '**' + game.playerList[i].uid + '(' + COLOR_NAME[i] + ')が道賞を獲得しました**'
                                    );
                                    
                                    game.sound = Sound.GET;
                                } else if (Game.isHataTriangle(game, index)) {
                                    game.sound = Sound.HATA;
                                } else {
                                    game.sound = Sound.BUILD;
                                }
                            }
                        })(this);
                        break;
                    case 'r':
                        if (this.game.phase === Phase.MAIN) { this.game.phase = Phase.BUILD_CITY; }
                        break;
                    case 's': // 街設置
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.BUILD_CITY || 
                                game.phase === Phase.MEDICINE
                                ) {

                                var active = game.active;

                                if(game.phase === Phase.MEDICINE) {
                                    Game.loseResource(game, active, Resource.ORE, 2);
                                    Game.loseResource(game, active, Resource.GRAIN, 1);
                                    Game.discardCard(game, game.active, Card.MEDICINE);
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.MEDICINE]}」を利用しました。`);
                                } else {
                                    Game.loseResource(game, active, Resource.ORE, 3);
                                    Game.loseResource(game, active, Resource.GRAIN, 2);
                                }
                                that.chat('?', 'deeppink', '街を配置しました。');

                                var index = that.split(message)[0];
                                Game.buildCity(game, index);
                                
                                game.phase = Phase.MAIN;
                                game.sound = Sound.BUILD;
                            }
                        })(this);
                        break;
                    case 't': // 城壁設置
                        if (this.game.phase === Phase.MAIN) { this.game.phase = Phase.BUILD_CITYWALL; }
                        break;
                    case 'u':
                        if (this.game.phase === Phase.MAIN) { this.game.phase = Phase.DOMESTIC_TRADE1; }
                        break;
                    case 'v': // 国内貿易
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.DOMESTIC_TRADE1) {
                                var param = that.split(message);
                                var playerList = game.playerList;
                                var trade = game.trade;
                                var active = game.active;
                                var playerIndex = trade.playerIndex = parseInt(param[0]);

                                if(playerIndex === 9) { // broadcast                                    
                                    that.chat(
                                          '?'
                                        , 'pink'
                                        , '国内貿易を申し込みました「all」'
                                    );
                                } else {
                                    that.chat(
                                          '?'
                                        , FONT_COLOR[playerIndex]
                                        , '国内貿易を申し込みました「'
                                          + playerList[playerIndex].uid
                                          + '(' + COLOR_NAME[playerIndex] + ')」'
                                    );
                                }


                                var tmp = '';
                                var inputSum = 0;

                                var i;
                                for (i = 1; i < 9; i++) {
                                    if (param[i] !== '0') { tmp += '「' + RESOURCE_NAME[i - 1] + ':' + param[i] + '」'; }
                                    inputSum += trade.input[i - 1] = parseInt(param[i]);
                                }
                                
                                if (tmp === '') {
                                    that.chat('?', 'deeppink', '国内貿易(出)「なし」');
                                } else {
                                    that.chat('?', 'deeppink', '国内貿易(出)' + tmp);
                                }

                                tmp = '';
                                var outputSum = 0;
                                
                                for (i = 9; i < 17; i++) {
                                    if (param[i] !== '0') { tmp += '「' + RESOURCE_NAME[i - 9] + ':' + param[i] + '」'; }
                                    outputSum += trade.output[i - 9] = parseInt(param[i]);
                                }
                                
                                if (tmp === '') {
                                    that.chat('?', 'deeppink', '国内貿易(求)「なし」');
                                } else {
                                    that.chat('?', 'deeppink', '国内貿易(求)' + tmp);
                                }

                                if (inputSum === 0 || outputSum === 0) {
                                    that.chat('?', 'deeppink', 'お互いに最低1枚の資源が必要です。');

                                    game.phase = Phase.MAIN;
                                } else {
                                    var isNegotiation = false;

                                    for (i = 0; !isNegotiation && i < 8; i++) {
                                        if (trade.input[i] > 0 && trade.output[i] > 0) { isNegotiation = true; }
                                    }

                                    if (isNegotiation) {
                                        that.chat('?', 'deeppink', '偽装譲渡はできません。');
                                        game.phase = Phase.MAIN;
                                    } else {
                                        if(playerIndex === 9) {
                                            var len1 = playerList.filter(p => p.uid !== '').length;
                                            var priority = game.priority;
                                            priority.length = 0;
                                            for (var i = 0; i < len1; i++) {
                                                priority.push(i);
                                                if (i !== active) {
                                                    playerList[i].trading = true;
                                                }
                                            }
                                            game.phase = Phase.DOMESTIC_TRADE3;
                                        } else {
                                            var priority = game.priority;
                                            priority.length = 0;
                                            priority.push(playerIndex);
                                            game.phase = Phase.DOMESTIC_TRADE2;
                                        }
                                    }
                                }
                            }
                        })(this);
                        break;
                    case 'w':　// 国内貿易取引
                        (function (that) {
                            var game = that.game;
                            var active = game.active;

                            if (game.phase === Phase.DOMESTIC_TRADE2) {
                                var trade = game.trade;
                                var output = trade.output;
                                var tradeResource = game.playerList[trade.playerIndex].resource;

                                if (
                                       tradeResource[Resource.BRICK] >= output[Resource.BRICK]
                                    && tradeResource[Resource.WOOL] >= output[Resource.WOOL]
                                    && tradeResource[Resource.ORE] >= output[Resource.ORE]
                                    && tradeResource[Resource.GRAIN] >= output[Resource.GRAIN]
                                    && tradeResource[Resource.LUMBER] >= output[Resource.LUMBER]
                                    && tradeResource[Resource.CLOTH] >= output[Resource.CLOTH]
                                    && tradeResource[Resource.COIN] >= output[Resource.COIN]
                                    && tradeResource[Resource.PAPER] >= output[Resource.PAPER]
                                ) {
                                    var activeResource = game.playerList[active].resource;
                                    var input = trade.input;

                                    var i;
                                    for (i = 0; i < 8; i++) {
                                        activeResource[i] -= input[i];
                                        activeResource[i] += output[i];
                                        tradeResource[i] += input[i];
                                        tradeResource[i] -= output[i];
                                    }
                                    
                                    that.chat('?', 'deeppink', '交換しました。');
                                } else {
                                    that.chat('?', 'deeppink', '資源が足りませんでした。');
                                }

                                var priority = game.priority;
                                priority.length = 0;
                                priority.push(active);

                                that.game.phase = Phase.MAIN;
                            }
                        })(this);
                        break;
                    case 'x': // 国内貿易拒否
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.DOMESTIC_TRADE2) {
                                that.chat('?', 'deeppink', '拒否されました。');

                                var active = game.active;
                                var priority = game.priority;
                                priority.length = 0;
                                priority.push(active);

                                that.game.phase = Phase.MAIN;
                            }
                        })(this);
                        break;
                    case 'y':
                        if (this.game.phase === Phase.MAIN) { this.game.phase = Phase.INTERNATIONAL_TRADE; }
                        break;
                    case 'z': // 海外貿易
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.INTERNATIONAL_TRADE) {
                                that.chat('?', 'deeppink', '海外貿易を申し込みました。');

                                var param = that.split(message);
                                var active = game.active;

                                var tmp = '海外貿易(出)';

                                var i;
                                for (i = 0; i < 8; i++) {
                                    if (param[i] !== '0') {
                                        tmp += '「' + RESOURCE_NAME[i] + ':' + param[i] + '」';
                                        Game.loseResource(game, active, i, parseInt(param[i]));
                                    }
                                }
                                
                                that.chat('?', 'deeppink', tmp);

                                var tmp = '海外貿易(求)';

                                for (i = 8; i < 16; i++) {
                                    if (param[i] !== '0') {
                                        tmp += '「' + RESOURCE_NAME[i - 8] + ':' + param[i] + '」';
                                        Game.gainResource(game, active, i - 8, parseInt(param[i]));
                                    }
                                }
                                
                                that.chat('?', 'deeppink', tmp);

                                that.chat('?', 'deeppink', '交換しました。');
                                
                                that.game.phase = Phase.MAIN;
                            }
                        })(this);
                        break;
                    case 'A': // 勝利宣言
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.DICE || game.phase === Phase.MAIN) {
                                that.chat(
                                      '?'
                                    , 'deeppink'
                                    , '++勝利 おめでとう++'
                                );

                                var active = game.active;
                                var playerList = game.playerList;
                                var activePlayer = playerList[active];
                                that.finishGameLog(activePlayer.uid, 'victory', game);

                                that.chat(
                                      '?'
                                    , 'deeppink'
                                    , activePlayer.uid + '(' + COLOR_NAME[active] + ')'
                                );

                                var i;
                                for (i = 0; i < game.playerSize; i++) { playerList[i].uid = ''; }
                                
                                game.playerSize = 4;
                                game.state = State.READY;
                                that.isPlaying = false;

                                game.sound = Sound.ENDING;
                            }
                        })(this);
                        break;
                    case 'B': // ターンエンド
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.MAIN) {
                                if(game.playerList[game.active].progressCard.length > 4) {
                                    game.phase = Phase.DISCARD_CARD;
                                } else {
                                    that.goToNextPlayer();
                                }
                            }
                        })(this);
                        break;
                    case 'C':
                        (function (that) {
                            var game = that.game;
                            if (game.phase === Phase.MAIN) {
                                game.phase = Phase.SOLDIER1;
                            }
                        })(this);
                        break;
                    case 'D': // 都市開発アクション
                        (function (that) {
                            var game = that.game;
                            if (game.phase === Phase.MAIN) {
                                game.phase = Phase.DEVELOPMENT1;
                            }
                        })(this);
                        break;
                    case 'E': // 都市開発
                    (function (that) {
                        var game = that.game;

                        if (game.phase === Phase.DEVELOPMENT1 || 
                            game.phase === Phase.CRANE
                            ) {
                            var type = parseInt(that.split(message)[0]);
                            var crane = false;
                            if(type >= 3) {
                                type -= 3;
                                crane = true;
                                Game.discardCard(game, game.active, Card.CRANE);
                                that.chat('?', 'deeppink', `「${CARD_NAME[Card.CRANE]}」を利用しました。`);
                            }
                            that.chat('?', 'deeppink', `「${DEVELOP_NAME[type]}」を開発しました。`);
                            var pillagedPlayer = Game.developeCity(game, type, crane);
                            if(isNaN(pillagedPlayer)) { // メトロポリスが建設できない
                                that.game.phase = Phase.MAIN;
                            } else if (pillagedPlayer === Index.NONE) { // 誰もメトロポリスを取っていない
                                that.game.selectingDevelopmentType = type;
                                that.game.phase = Phase.BUILD_METROPOLIS;
                            } else { // メトロポリスを奪える
                                that.game.selectingDevelopmentType = type;
                                if(that.game.playerList[pillagedPlayer].metropolisIndex.filter(i => i !== Index.NONE).length > 1) {
                                    // 奪われるメトロポリスを選択するフェーズ
                                    that.game.priority.length = 0;
                                    that.game.priority.push(pillagedPlayer);
                                    that.game.phase = Phase.CHOICE_PILLAGED_METROPOLIS;
                                    that.game.sound = Sound.ROBBER;
                                } else {
                                    let idx = that.game.settlementList.findIndex(s => {
                                        return (s & 0xff00) === SettlementRank.METROPOLIS && (s & 0x00ff) === pillagedPlayer;
                                    });
                                    Game.pillageMetropolis(game, pillagedPlayer, idx, type);
                                    that.game.phase = Phase.BUILD_METROPOLIS;
                                }
                            }
                        }
                    })(this);                    
                        break;
                    case 'F':
                        if (this.game.phase === Phase.SOLDIER1) { this.game.phase = Phase.BUILD_KNIGHT; }
                        break;
                    case 'G':
                        if (this.game.phase === Phase.SOLDIER1) { this.game.phase = Phase.ACTIVATE_KNIGHT; }
                        break;
                    case 'H': // インデックス指定系の処理
                        var game = this.game;
                        switch(game.phase) {
                            case Phase.BUILD_KNIGHT:
                                (function (that) {
                                    var game = that.game;                                    
                                    that.chat('?', 'deeppink', '騎士を配置しました。');
    
                                    var active = game.active;
                                    Game.loseResource(game, active, Resource.ORE, 1);
                                    Game.loseResource(game, active, Resource.WOOL, 1);
                                    
                                    var index = parseInt(that.split(message)[0]);
                                    Game.buildKnight(game, index);
    
                                    var i = Game.longestRoad(game);
                                    
                                    if (i !== Index.NONE) {
                                        that.chat(
                                            '?'
                                        , FONT_COLOR[i]
                                        , '**' + game.playerList[i].uid + '(' + COLOR_NAME[i] + ')が道賞を獲得しました**'
                                        );
                                        
                                        game.sound = Sound.GET;
                                    } else {
                                        game.sound = Sound.BUILD;
                                    }
                                    game.phase = Phase.MAIN;
                                })(this);
                                break;
                            case Phase.ACTIVATE_KNIGHT:
                                (function (that) {
                                    var game = that.game;
                                    that.chat('?', 'deeppink', '騎士を活性化しました。');
    
                                    var active = game.active;
    
                                    Game.loseResource(game, active, Resource.GRAIN, 1);
    
                                    var index = that.split(message)[0];
                                    Game.activateKnight(game, index);
                                    
                                    game.phase = Phase.MAIN;
                                    game.sound = Sound.BUILD;
                                })(this);
                                break;
                            case Phase.PROMOTE_KNIGHT:
                            case Phase.SMITH1:
                            case Phase.SMITH2:
                                (function (that) {
                                    var game = that.game;
                                    var active = game.active;
                                    var index = that.split(message)[0];

                                    that.chat('?', 'deeppink', '騎士を昇格しました。');
                                    Game.promoteKnight(game, index);

                                    if(game.phase === Phase.SMITH1) {
                                        Game.discardCard(game, game.active, Card.SMITH);
                                        if(Game.hasCanPromoteKnight(game)) {
                                            game.phase = Phase.SMITH2;
                                        } else {
                                            game.phase = Phase.MAIN;
                                        }
                                    } else if (game.phase === Phase.SMITH2) {
                                        game.phase = Phase.MAIN;

                                    } else {
                                        Game.loseResource(game, active, Resource.WOOL, 1);
                                        Game.loseResource(game, active, Resource.ORE, 1);
                                        game.phase = Phase.MAIN;
                                    }
                                    
                                    game.sound = Sound.BUILD;
                                })(this);                        
                                break;
                            case Phase.MOVE_KNIGHT2:
                                (function (that) {
                                    var game = that.game;
                                    that.chat('?', 'deeppink', '騎士を移動しました。');
                                    var index = that.split(message)[0];
                                    game.attackedKnight = game.knightList[index];
                                    var attackedPlayer = game.knightList[index] & 0x0000ff;
                                    game.knightList[index] = game.knightList[game.selectingKnight];
                                    game.knightList[game.selectingKnight] = KnightRank.NONE | 0x0000ff;
                                    Game.deactivateKnight(game, index);
    
                                    if ((game.attackedKnight & 0xff0000) !== KnightRank.NONE) {
                                        var result = [];
                                        for(let i = 0; i < SETTLEMENT_LINK[index].length; i++) {
                                            Game.canKnightMove(game, attackedPlayer, SETTLEMENT_LINK[index][i], result);
                                        }
                                        if (result.length === 0) { // 騎士消滅
                                            game.selectingKnight = -1;
                                            game.phase = Phase.MAIN;
                                            game.sound = Sound.ROBBER;
                                            var rank = (game.attackedKnight & 0xff0000) >>> 16;
                                            game.playerList[attackedPlayer].knightStock[rank - 1]++;
                                        } else if(result.length === 1) { // 騎士移動（自動)
                                            game.knightList[result[0]] = game.attackedKnight;
                                            game.selectingKnight = -1;
                                            game.phase = Phase.MAIN;
                                            game.sound = Sound.ROBBER;
                                        } else if(result.length > 1) { // 騎士移動（手動)
                                            game.selectingKnight = index;
                                            game.phase = Phase.MOVE_KNIGHT3;
                                            game.sound = Sound.ROBBER;
                                            game.priority.length = 0;
                                            game.priority.push(attackedPlayer);
                                        }
                                    } else {
                                        game.phase = Phase.MAIN;
                                        game.sound = Sound.BUILD;
                                        game.selectingKnight = -1;
                                    }
                                    var i = Game.longestRoad(game);
                                    
                                    if (i !== Index.NONE) {
                                        that.chat(
                                            '?'
                                            , FONT_COLOR[i]
                                            , '**' + game.playerList[i].uid + '(' + COLOR_NAME[i] + ')が道賞を獲得しました**'
                                        );
                                        
                                        game.sound = Sound.GET;
                                    }
                                })(this);                         
                                break;
                            case Phase.MOVE_KNIGHT3:
                                (function (that) {
                                    var game = that.game;
                                    that.chat('?', 'deeppink', '騎士を移動しました。');
                                    var index = that.split(message)[0];
                                    
                                    game.knightList[index] = game.attackedKnight;
                                    game.attackedKnight = KnightRank.NONE;
                                    game.priority.length = 0;
                                    game.priority.push(game.active);
                                    game.phase = Phase.MAIN;
                                    var i = Game.longestRoad(game);
                                    
                                    if (i !== Index.NONE) {
                                        that.chat(
                                            '?'
                                            , FONT_COLOR[i]
                                            , '**' + game.playerList[i].uid + '(' + COLOR_NAME[i] + ')が道賞を獲得しました**'
                                        );
                                        
                                        game.sound = Sound.GET;
                                    } else {
                                        game.sound = Sound.BUILD;
                                    }
                                })(this); 
                                break;
                            case Phase.BARBARIAN_DEFEAT1:
                                (function (that) {
                                    var game = that.game;
        
                                    that.chat('?', 'deeppink', '街が襲撃されました。');
    
                                    var index = that.split(message)[0];
                                    var player = game.priority[0];
                                    Game.pillageCity(game, index, player);
                                    
                                    if(game.weakestKnightsPlayer.length !== 0) {
                                        game.priority.length = 0;
                                        game.priority.push(game.weakestKnightsPlayer.shift());
                                        game.sound = Sound.ROBBER;
                                    } else {
                                        game.priority.length = 0;
                                        game.priority.push(game.active);
                                        that.afterBarbarian();
                                    }
                                })(this);
                                break;
                            case Phase.BUILD_METROPOLIS:
                                (function (that) {
                                    var game = that.game;
        
                                    that.chat('?', 'deeppink', 'メトロポリスを配置しました。');
    
                                    var index = that.split(message)[0];
                                    Game.buildMetropolis(game, index, game.selectingDevelopmentType);
                                    game.phase = Phase.MAIN;
                                    game.sound = Sound.GET;
                                })(this);
                                break;
                            case Phase.CHOICE_PILLAGED_METROPOLIS:
                                (function (that) {
                                    var game = that.game;
        
                                    that.chat('?', 'deeppink', 'メトロポリスを奪いました。');
    
                                    var index = that.split(message)[0];
                                    Game.pillageMetropolis(game, game.priority[0], index, game.selectingDevelopmentType);
                                    game.priority.length = 0;
                                    game.priority.push(game.active);
                                    game.phase = Phase.BUILD_METROPOLIS;
                                    game.sound = Sound.BUILD;
                                })(this);
                                break;
                            case Phase.BUILD_CITYWALL:
                            case Phase.ENGINEER:
                                (function (that) {
                                    var game = that.game;
        
                                    
                                    var active = game.active;
                                    if(game.phase === Phase.ENGINEER) {   
                                        that.chat('?', 'deeppink', `「${CARD_NAME[Card.ENGINEER]}」を利用しました。`);
                                        Game.discardCard(game, active, Card.ENGINEER);
                                    } else {
                                        Game.loseResource(game, active, Resource.BRICK, 2);
                                    }
                                    that.chat('?', 'deeppink', '城壁を配置しました。');
    
                                    var index = that.split(message)[0];
                                    Game.buildCityWall(game, index);
                                    game.phase = Phase.MAIN;
                                    game.sound = Sound.BUILD;
                                })(this);
                                break;
                            case Phase.INVENTOR1:
                                (function (that) {
                                    var game = that.game;
                                    var active = game.active;
                                    var index = parseInt(that.split(message)[0]);
                                    game.inventorSelecting = index;
                                    game.phase = Phase.INVENTOR2;
                                })(this);
                                break;
                            case Phase.INVENTOR2:
                                (function (that) {
                                    var game = that.game;
                                    var active = game.active;
                                    var index = that.split(message)[0];
                                    var tmp = game.numberList[index];
                                    game.numberList[index] = game.numberList[game.inventorSelecting];
                                    game.numberList[game.inventorSelecting] = tmp;
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.INVENTOR]}」を利用しました。`);
                                    that.chat('?', 'deeppink', `${RESOURCE_NAME[game.landList[index]]}(${parseInt(index) + 1})の「${game.numberList[game.inventorSelecting]}」と${RESOURCE_NAME[game.landList[game.inventorSelecting]]}(${parseInt(game.inventorSelecting) + 1})の「${game.numberList[index]}」を交換しました。`);
                                    Game.discardCard(game, active, Card.INVENTOR);
                                    game.inventorSelecting = Index.NONE;
                                    game.phase = Phase.MAIN;
                                    game.sound = Sound.BUILD;
                                })(this);
                                break;
                            case Phase.DESERTER1:
                                (function (that) {
                                    var game = that.game;
                                    var index = parseInt(that.split(message)[0]);
                                    game.priority.length = 0;
                                    game.priority.push(index);
                                    game.phase = Phase.DESERTER2;
                                    game.sound = Sound.BUILD;
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.DESERTER]}」を利用しました。`);
                                    Game.discardCard(game, game.active, Card.DESERTER);
                                })(this);
                                break;                                
                            case Phase.DESERTER2:
                                (function (that) {
                                    var game = that.game;
                                    var index = parseInt(that.split(message)[0]);
                                    game.selectingKnight = game.knightList[index];
                                    var rank = (game.selectingKnight & 0xff0000) >>> 16;
                                    game.playerList[game.priority[0]].knightStock[rank -1]++;
                                    game.knightList[index] =  KnightRank.NONE | 0x0000ff;
                                    let buildRank;
                                    for(buildRank = rank -1; buildRank >= 0; buildRank--) {
                                        if(game.playerList[game.active].knightStock[buildRank] > 0) {
                                            break;
                                        }
                                    }
                                    if(buildRank < 0 || !Game.hasCanBuildKnight(game)) {
                                        game.phase = Phase.MAIN;
                                    } else {
                                        game.selectingKnight = (game.selectingKnight & 0x00ff00) |  ((buildRank + 1) << 16);
                                        game.phase = Phase.DESERTER3;
                                    }                                        
                                    that.chat('?', 'deeppink', `騎士の逃亡 「${game.playerList[game.priority[0]].uid}(${COLOR_NAME[game.priority[0]]})」`);
                                    game.priority.length = 0;
                                    game.priority.push(game.active);
                                    game.sound = Sound.ROBBER;
                                })(this);
                                break;                                
                            case Phase.DESERTER3:
                                (function (that) {
                                    var game = that.game;
                                    var index = parseInt(that.split(message)[0]);
                                    var rank = (game.selectingKnight & 0xff0000) >>> 16;
                                    game.knightList[index] = game.selectingKnight | game.active;
                                    game.playerList[game.active].knightStock[rank - 1]--;
                                    game.selectingKnight = Index.NONE;
                                    that.chat('?', 'deeppink', '騎士を配置しました。');
                                    game.phase = Phase.MAIN;
                                    game.sound = Sound.BUILD;
                                })(this);
                                break;                                
                            case Phase.DIPLOMAT1:
                                (function (that) {
                                    var game = that.game;
                                    var index = parseInt(that.split(message)[0]);
                                    var color = game.roadList[index];
                                    game.playerList[color].roadStock++;
                                    game.roadList[index] = Index.NONE;
                                    Game.discardCard(game, game.active, Card.DIPLOMAT);
                                    if(color === game.active) { // 自分の道を奪った場合
                                        game.phase = Phase.DIPLOMAT2;
                                        game.sound = Sound.BUILD;
                                    } else { // 人の道を奪った場合
                                        var i = Game.longestRoad(game);

                                        if (i !== Index.NONE) {
                                            that.chat(
                                                '?'
                                              , FONT_COLOR[i]
                                              , '**' + game.playerList[i].uid + '(' + COLOR_NAME[i] + ')が道賞を獲得しました**'
                                            );
                                            
                                            game.sound = Sound.GET;
                                        } else {
                                            game.sound = Sound.ROBBER;
                                        }
                                        game.phase = Phase.MAIN;
                                    }
                                })(this);
                                break;
                            case Phase.INTRIGUE:
                                (function (that) {
                                    var game = that.game;
                                    var index = parseInt(that.split(message)[0]);
                                    game.attackedKnight = game.knightList[index];
                                    var attackedPlayer = game.knightList[index] & 0x0000ff;
                                    Game.discardCard(game, game.active, Card.INTRIGUE);
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.INTRIGUE]}」を利用しました。`);
                                    that.chat('?', 'deeppink', '騎士を除去します。');
    
                                    if ((game.attackedKnight & 0xff0000) !== KnightRank.NONE) {
                                        var result = [];
                                        for(let i = 0; i < SETTLEMENT_LINK[index].length; i++) {
                                            Game.canKnightMove(game, attackedPlayer, SETTLEMENT_LINK[index][i], result);
                                        }
                                        game.knightList[index] = KnightRank.NONE | 0x0000ff;
                                        if (result.length === 0) { // 騎士消滅
                                            game.selectingKnight = -1;
                                            game.phase = Phase.MAIN;
                                            game.sound = Sound.ROBBER;
                                            var rank = (game.attackedKnight & 0xff0000) >>> 16;
                                            game.playerList[attackedPlayer].knightStock[rank -1 ]++;
                                        } else if(result.length === 1) { // 騎士移動（自動)
                                            game.knightList[result[0]] = game.attackedKnight;
                                            game.selectingKnight = -1;
                                            game.phase = Phase.MAIN;
                                            game.sound = Sound.ROBBER;
                                        } else if(result.length > 1) { // 騎士移動（手動)
                                            game.selectingKnight = index;
                                            game.phase = Phase.MOVE_KNIGHT3;
                                            game.sound = Sound.ROBBER;
                                            game.priority.length = 0;
                                            game.priority.push(attackedPlayer);
                                        }
                                    } else {
                                        game.phase = Phase.MAIN;
                                        game.sound = Sound.BUILD;
                                        game.selectingKnight = -1;
                                    }
                                    var i = Game.longestRoad(game);
                                    
                                    if (i !== Index.NONE) {
                                        that.chat(
                                            '?'
                                            , FONT_COLOR[i]
                                            , '**' + game.playerList[i].uid + '(' + COLOR_NAME[i] + ')が道賞を獲得しました**'
                                        );
                                        
                                        game.sound = Sound.GET;
                                    }
                                })(this);                         
                                break; 
                            case Phase.SPY1:
                                (function (that) {
                                    var game = that.game;
                                    var active = game.active;
                                    var index = parseInt(that.split(message)[0]);
                                    game.spySelecting = index;
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.SPY]}」を利用しました。`);
                                    Game.discardCard(game, game.active, Card.SPY);
                                    game.phase = Phase.SPY2;
                                })(this);
                                break;                                                                                               
                            case Phase.SPY2:
                                (function (that) {
                                    var game = that.game;
                                    var active = game.active;
                                    var index = parseInt(that.split(message)[0]);
                                    var progressCard = game.playerList[game.spySelecting].progressCard;
                                    progressCard.splice(progressCard.findIndex(c => c === index), 1);
                                    game.playerList[active].progressCard.push(index);
                                    that.chat('?', 'deeppink', `「${game.playerList[game.spySelecting].uid}(${COLOR_NAME[game.spySelecting]})」のカードを略奪しました。`);
                                    game.spySelecting = Index.NONE;
                                    game.phase = Phase.MAIN;
                                    game.sound = Sound.ROBBER;
                                })(this);
                                break; 
                            case Phase.ALCHEMIST:
                                (function (that) {
                                    var game = that.game;
                                    Game.discardCard(game, game.active, Card.ALCHEMIST);
                                    var param = that.split(message);
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.ALCHEMIST]}」を利用しました。`);
                                    game.alchemistDice1 = parseInt(param[0]);
                                    game.alchemistDice2 = parseInt(param[1]);
                                    game.phase = Phase.DICE;
                                })(this);
                                break;
                            case Phase.COMMERCIAL_HARBOR1:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    game.commercialHarborCurrent = index;
                                    game.phase = Phase.COMMERCIAL_HARBOR2;
                                })(this);
                                break;
                            case Phase.COMMERCIAL_HARBOR2:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    if(game.commercialHarborDone.length === 0) {
                                        Game.discardCard(game, game.active, Card.COMMERCIAL_HARBOR);
                                        that.chat('?', 'deeppink', `「${CARD_NAME[Card.COMMERCIAL_HARBOR]}」を利用しました。`);
                                    }
                                    game.commercialHarborDone.push(game.commercialHarborCurrent);
                                    var sumCommodity = game.playerList[game.commercialHarborCurrent].resource[Resource.CLOTH]
                                    + game.playerList[game.commercialHarborCurrent].resource[Resource.COIN]
                                    + game.playerList[game.commercialHarborCurrent].resource[Resource.PAPER];

                                    if( sumCommodity > 0) {
                                            loseResource(game, game.active, index, 1);
                                            gainResource(game, game.commercialHarborCurrent, index, 1);
                                            game.priority.length = 0;
                                            game.priority.push(game.commercialHarborCurrent);
                                            game.phase = Phase.COMMERCIAL_HARBOR3;
                                            game.sound = Sound.BUILD;
                                    } else {
                                        that.chat('?', 'deeppink', `「${game.playerList[game.commercialHarborCurrent].uid}(${COLOR_NAME[game.commercialHarborCurrent]})」は交易品がありませんでした。`);
                                        if(game.commercialHarborDone.length === game.playerSize -1) { // 全員おわり
                                            game.commercialHarborDone = [];
                                            game.phase = Phase.MAIN;
                                        } else {
                                            game.phase = Phase.COMMERCIAL_HARBOR1;
                                        }
                                    }
                                })(this);
                                break;
                            case Phase.COMMERCIAL_HARBOR3:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    loseResource(game, game.commercialHarborCurrent, index, 1);
                                    gainResource(game, game.active, index, 1);
                                    that.chat('?', 'deeppink', `「${game.playerList[game.commercialHarborCurrent].uid}(${COLOR_NAME[game.commercialHarborCurrent]})」と交易品を交換しました。`);
                                    game.priority.length = 0;
                                    game.priority.push(game.active);
                                    if(game.commercialHarborDone.length === game.playerSize -1) { // 全員おわり
                                        game.commercialHarborDone = [];
                                        game.phase = Phase.MAIN;
                                    } else {
                                        if(game.playerList[game.active].resource.filter((r, i) => i < Resource.CLOTH).reduce((p, c) => p + c, 0) > 0) {
                                            game.phase = Phase.COMMERCIAL_HARBOR1;
                                        } else { // 資源がなくなったらおわり
                                            game.phase = Phase.MAIN;
                                        }
                                    }

                                })(this);
                                break;
                            case Phase.MASTER_MERCHANT1:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.MASTER_MERCHANT]}」を利用しました。`);
                                    Game.discardCard(game, game.active, Card.MASTER_MERCHANT);
                                    game.masterMerchantSelecting = index;
                                    game.phase = Phase.MASTER_MERCHANT2;
                                })(this);
                                break;
                            case Phase.MASTER_MERCHANT2:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    loseResource(game, game.masterMerchantSelecting, index, 1);
                                    gainResource(game, game.active, index, 1);
                                    game.sound = Sound.ROBBER;
                                    if(game.playerList[game.masterMerchantSelecting].resource.reduce((p, c) => p + c, 0) > 0) {
                                        game.phase = Phase.MASTER_MERCHANT3;
                                    } else {
                                        game.phase = Phase.MAIN;
                                    }
                                })(this);
                                break;
                            case Phase.MASTER_MERCHANT3:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    loseResource(game, game.masterMerchantSelecting, index, 1);
                                    gainResource(game, game.active, index, 1);
                                    game.sound = Sound.ROBBER;
                                    game.phase = Phase.MAIN;
                                })(this);
                                break;
                            case Phase.MERCHANT_FLEET:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    Game.discardCard(game, game.active, Card.MERCHANT_FLEET);
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.MERCHANT_FLEET]}」を利用しました。`);
                                    that.chat('?', 'deeppink', `「${RESOURCE_NAME[index]}」貿易を一時獲得。`);
                                    game.playerList[game.active].merchantFleetResource.push(index);
                                    game.sound = Sound.BUILD;
                                    game.phase = Phase.MAIN;
                                })(this);
                                break;
                            case Phase.MERCHANT:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    Game.discardCard(game, game.active, Card.MERCHANT);
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.MERCHANT]}」を利用しました。`);
                                    if(game.merchantInfo[1] !== Index.NONE) {
                                        game.playerList[game.merchantInfo[1]].bonusScore--;
                                    }
                                    game.playerList[game.active].bonusScore++;
                                    game.merchantInfo = [index, game.active];
                                    
                                    game.sound = Sound.GET;
                                    game.phase = Phase.MAIN;
                                })(this);
                                break;
                            case Phase.RESOURCE_MONOPOLY:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    Game.discardCard(game, game.active, Card.RESOURCE_MONOPOLY);
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.RESOURCE_MONOPOLY]}」を利用しました。`);
                                    that.chat('?', 'deeppink', `「${RESOURCE_NAME[index]}」を独占。`);
                                    for(let i = 0; i < game.playerSize; i++) {
                                        if (i === game.active) { continue; }
                                        var currentPlayer = game.playerList[i];
                                        const resource = currentPlayer.resource[index];
                                        var color = FONT_COLOR[i];
                                        var colorName = COLOR_NAME[i];
                                        if(resource === 1) {
                                            that.chat('?', color, `「${currentPlayer.uid}(${colorName})」から1枚「${RESOURCE_NAME[index]}」を略奪。`);
                                            loseResource(game, i, index, 1);
                                            gainResource(game, game.active, index, 1);
                                        } else if (resource > 1) {
                                            that.chat('?', color, `「${currentPlayer.uid}(${colorName})」から2枚「${RESOURCE_NAME[index]}」を略奪。`);
                                            loseResource(game, i, index, 2);
                                            gainResource(game, game.active, index, 2);
                                        }
                                    }
                                    game.sound = Sound.BUILD;
                                    game.phase = Phase.MAIN;
                                })(this);
                                break;
                            case Phase.TRADE_MONOPOLY:
                                (function (that) {
                                    var game = that.game;
                                    var param = that.split(message);
                                    var index = parseInt(param[0]);
                                    Game.discardCard(game, game.active, Card.TRADE_MONOPOLY);
                                    that.chat('?', 'deeppink', `「${CARD_NAME[Card.TRADE_MONOPOLY]}」を利用しました。`);
                                    that.chat('?', 'deeppink', `「${RESOURCE_NAME[index]}」を独占。`);
                                    for(let i = 0; i < game.playerSize; i++) {
                                        if (i === game.active) { continue; }
                                        var currentPlayer = game.playerList[i];
                                        const resource = currentPlayer.resource[index];
                                        var color = FONT_COLOR[i];
                                        var colorName = COLOR_NAME[i];
                                        if (resource > 0) {
                                            that.chat('?', color, `「${currentPlayer.uid}(${colorName})」から「${RESOURCE_NAME[index]}」を略奪。`);
                                            loseResource(game, i, index, 1);
                                            gainResource(game, game.active, index, 1);
                                        }
                                    }
                                    game.sound = Sound.BUILD;
                                    game.phase = Phase.MAIN;
                                })(this);
                                break;

                            default:
                                break;
                        }
                        break;
                    case 'I':
                        if (this.game.phase === Phase.SOLDIER1) { this.game.phase = Phase.PROMOTE_KNIGHT; }
                        break;
                    case 'J': 
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.GAIN_RESOURCE) {
                                var type = that.split(message)[0];

                                that.chat(
                                    '?'
                                    , 'deeppink'
                                    , '「' + RESOURCE_NAME[type] + '」を獲得しました。'
                                );

                                var resourceStock = game.resourceStock;
                                resourceStock[type]--;
                                game.playerList[game.priority[0]].resource[type]++;
                                var resourceSum =  game.resourceStock[Resource.BRICK]
                                + game.resourceStock[Resource.WOOL]
                                + game.resourceStock[Resource.ORE]
                                + game.resourceStock[Resource.GRAIN]
                                + game.resourceStock[Resource.LUMBER];

                                if(game.noGainPlayer.length !== 0 && resourceSum > 0) {
                                    game.priority.length = 0;
                                    game.priority.push(game.noGainPlayer.shift());
                                } else {
                                    game.priority.length = 0;
                                    game.priority.push(game.active);
                                    that.discardCardActionOrMain();
                                }
                                game.sound = Sound.BUILD;
                            }
                        })(this);
                        break;
                    case 'K':
                        if (this.game.phase === Phase.SOLDIER1) { this.game.phase = Phase.MOVE_KNIGHT1; }
                        break;
                    case 'L':
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.MOVE_KNIGHT1) {
                                var index = that.split(message)[0];
                                game.selectingKnight = index;
                                game.phase = Phase.MOVE_KNIGHT2;
                            }
                        })(this);  
                        break;
                    case 'M': 
                        (function (that) {
                            var game = that.game;

                            if (game.phase === Phase.DISCARD_CARD || game.phase === Phase.DISCARD_CARD_OTHER) {
                                var index = that.split(message)[0];
                                var discardedCard = game.playerList[game.priority[0]].progressCard[index];

                                that.chat(
                                    '?'
                                    , 'deeppink'
                                    , 'カードを廃棄しました。'
                                );

                                Game.discardCard(game, game.priority[0], discardedCard);

                                if(game.needDiscardCardPlayer.length !== 0) {
                                    game.priority.length = 0;
                                    game.priority.push(game.needDiscardCardPlayer.shift());
                                } else {
                                    if(game.phase === Phase.DISCARD_CARD) {
                                        that.goToNextPlayer();
                                    } else {
                                        game.priority.length = 0;
                                        game.priority.push(game.active);
                                        game.phase = Phase.MAIN;
                                    }
                                }
                            }
                        })(this);
                        break;
                    case 'N': // 国内貿易オークション
                        (function (that) {
                            var game = that.game;
                            var param = that.split(message);
                            var color = parseInt(param[0]);
                            var player = game.playerList[color];
                            var active = game.active;

                            if (game.phase === Phase.DOMESTIC_TRADE3) {
                                var trade = game.trade;
                                var output = trade.output;
                                var tradeResource = player.resource;

                                if (
                                        tradeResource[Resource.BRICK] >= output[Resource.BRICK]
                                    && tradeResource[Resource.WOOL] >= output[Resource.WOOL]
                                    && tradeResource[Resource.ORE] >= output[Resource.ORE]
                                    && tradeResource[Resource.GRAIN] >= output[Resource.GRAIN]
                                    && tradeResource[Resource.LUMBER] >= output[Resource.LUMBER]
                                    && tradeResource[Resource.CLOTH] >= output[Resource.CLOTH]
                                    && tradeResource[Resource.COIN] >= output[Resource.COIN]
                                    && tradeResource[Resource.PAPER] >= output[Resource.PAPER]
                                ) {
                                    var activeResource = game.playerList[active].resource;
                                    var input = trade.input;

                                    var i;
                                    for (i = 0; i < 8; i++) {
                                        activeResource[i] -= input[i];
                                        activeResource[i] += output[i];
                                        tradeResource[i] += input[i];
                                        tradeResource[i] -= output[i];
                                    }
                                    
                                    that.chat('?', FONT_COLOR[color], `「${player.uid}」と交換しました。`);
                                    var priority = game.priority;
                                    priority.length = 0;
                                    priority.push(active);
                                    game.playerList.forEach(p => p.trading = false);
    
                                    that.game.phase = Phase.MAIN;
                                } else {
                                    that.chat('?', FONT_COLOR[color], `「${player.uid}」は資源がありません`);
                                    player.trading = false;
                                    if(game.playerList.every(p => p.trading === false)) {
                                        var priority = game.priority;
                                        priority.length = 0;
                                        priority.push(active);
            
                                        that.game.phase = Phase.MAIN;
                                    }
                                }

                            }
                        })(this);
                        break;    
                    case 'O': // 国内貿易オークション拒否
                        (function (that) {
                            var game = that.game;
                            var param = that.split(message);
                            var color = parseInt(param[0]);
                            var player = game.playerList[color];
                            var active = game.active;
                            var priority = game.priority;

                            if (game.phase === Phase.DOMESTIC_TRADE3) {
                                that.chat('?', FONT_COLOR[color], `「${player.uid}」に拒否されました。`);
                                var i;
                                var len1 = priority.length;
                                for (i = 0; i < len1; i++) {
                                    if (priority[i] === color) { priority.splice(i, 1); }
                                }
                                
                                player.trading = false;
                                if(game.playerList.every(p => p.trading === false)) {
                                    priority.length = 0;
                                    priority.push(active);
        
                                    that.game.phase = Phase.MAIN;
                                }
                            }

                        })(this);
                        break;
                    case 'P':
                        this.afterBarbarian();
                        break;
                    case 'Q': 
                        if (this.game.phase === Phase.MAIN) { this.game.phase = Phase.USE_CARD; }
                        break;
                    case 'R':
                        if (this.game.phase === Phase.SOLDIER1) { this.game.phase = Phase.MOVE_ROBBER1; }
                        break;                        
                    case 'S':
                        (function (that) {
                            var game = that.game;
                            if (game.phase === Phase.MOVE_ROBBER1) {
                                var index = that.split(message)[0];
                                game.selectingKnight = index;
                                game.phase = Phase.MOVE_ROBBER2;
                            }
                        })(this); 
                        break;                        
                    case 'T':
                        (function (that) {
                            var game = that.game;
                            that.chat('?', 'deeppink', 'カードを引きました。');
                            if (game.phase === Phase.BARBARIAN_SAVE2) {
                                var index = parseInt(that.split(message)[0]);
                                var player = game.priority[0];
                                var nextCard = Game.getCard(game, player, index);
                                if(nextCard === Card.PRINTER || nextCard === Card.CONSTITUTION) {
                                    that.chat('?', 'deeppink', `ポイントカード「${CARD_NAME[nextCard]}」を引きました。`);
                                }

                                if(game.strongestKnightsPlayer.length !== 0) {
                                    game.priority.length = 0;
                                    game.priority.push(game.strongestKnightsPlayer.shift());
                                    game.sound = Sound.BUILD;
                                } else {
                                    game.priority.length = 0;
                                    game.priority.push(game.active);
                                    that.afterBarbarian();
                                }
                            }
                        })(this); 
                        break;                         
                    case 'U': // Use card
                        var game = this.game;
                        var index = parseInt(this.split(message)[0]);
                        switch(index) {
                            case Card.CRANE:
                                (function (that) {
                                    game.phase = Phase.CRANE;
                                })(this);
                                break;
                            case Card.ENGINEER:
                                (function (that) {
                                    game.phase = Phase.ENGINEER;
                                })(this);
                                break;
                            case Card.INVENTOR:
                                (function (that) {
                                    game.phase = Phase.INVENTOR1;
                                })(this);
                                break;
                            case Card.MEDICINE:
                                (function (that) {
                                    game.phase = Phase.MEDICINE;
                                })(this);
                                break;
                            case Card.IRRIGATION:
                                (function (that) {
                                    var game = that.game;
                                    that.chat('?', 'deeppink', `「${CARD_NAME[index]}」を利用しました。`);
                                    var gain = Game.harvestAction(game, Resource.GRAIN);
                                    that.chat('?', 'deeppink', `「${RESOURCE_NAME[Resource.GRAIN]}」を${gain}枚獲得しました。`);
                                    Game.discardCard(game, game.active, index);
                                    game.phase = Phase.MAIN;
                                    game.sound = Sound.BUILD;
                                })(this);
                                break;
                            case Card.MINING:
                                (function (that) {
                                    var game = that.game;
                                    that.chat('?', 'deeppink', `「${CARD_NAME[index]}」を利用しました。`);
                                    var gain = Game.harvestAction(game, Resource.ORE);
                                    that.chat('?', 'deeppink', `「${RESOURCE_NAME[Resource.ORE]}」を${gain}枚獲得しました。`);
                                    Game.discardCard(game, game.active, index);
                                    game.phase = Phase.MAIN;
                                    game.sound = Sound.BUILD;
                                })(this);
                                break;
                            case Card.ROAD_BUILDING:
                                (function (that) {
                                    game.phase = Phase.ROAD_BUILDING1;
                                })(this);
                                break;                                
                            case Card.SMITH:
                                (function (that) {
                                    game.phase = Phase.SMITH1;
                                })(this);
                                break;                                
                            case Card.BISHOP:
                                (function (that) {
                                    game.phase = Phase.BISHOP;
                                })(this);
                                break;                                
                            case Card.DESERTER:
                                (function (that) {
                                    game.phase = Phase.DESERTER1;
                                })(this);
                                break;                                
                            case Card.DIPLOMAT:
                                (function (that) {
                                    game.phase = Phase.DIPLOMAT1;
                                })(this);
                                break;                                
                            case Card.INTRIGUE:
                                (function (that) {
                                    game.phase = Phase.INTRIGUE;
                                })(this);
                                break;  
                            case Card.SPY:
                                (function (that) {
                                    game.phase = Phase.SPY1;
                                })(this);
                                break;                                
                            case Card.ALCHEMIST:
                                (function (that) {
                                    game.phase = Phase.ALCHEMIST;
                                })(this);
                                break;                                
                            case Card.COMMERCIAL_HARBOR:
                                (function (that) {
                                    game.commercialHarborDone = [];
                                    game.phase = Phase.COMMERCIAL_HARBOR1;
                                })(this);
                                break;                                
                            case Card.MASTER_MERCHANT:
                                (function (that) {
                                    game.masterMerchantSelecting = Index.NONE;
                                    game.phase = Phase.MASTER_MERCHANT1;
                                })(this);
                                break;                                
                            case Card.MERCHANT_FLEET:
                                (function (that) {
                                    game.phase = Phase.MERCHANT_FLEET;
                                })(this);
                                break;                                
                            case Card.RESOURCE_MONOPOLY:
                                (function (that) {
                                    game.phase = Phase.RESOURCE_MONOPOLY;
                                })(this);
                                break;                                
                            case Card.TRADE_MONOPOLY:
                                (function (that) {
                                    game.phase = Phase.TRADE_MONOPOLY;
                                })(this);
                                break;                                
                            case Card.MERCHANT:
                                (function (that) {
                                    game.phase = Phase.MERCHANT;
                                })(this);
                                break;                                
                            case Card.WARLORD:
                                (function (that) {
                                    game.knightList.forEach((k, i) => {
                                        if((k & 0x0000ff) === game.active) {
                                            Game.activateKnight(game, i);
                                        }
                                    });
                                    that.chat('?', 'deeppink', `「${CARD_NAME[index]}」を利用しました。`);
                                    Game.discardCard(game, game.active, index);
                                    game.phase = Phase.MAIN;
                                })(this);
                                break;                                
                            case Card.SABOTEUR:
                                (function (that) {
                                    var activePlayer = game.playerList[game.active];
                                    var activeVp = activePlayer.victoryPoint + activePlayer.bonusScore + activePlayer.baseScore;
                                    activePlayer.burst = 0;

                                    for (i = 0; i < game.playerSize; i++) {
                                        if(i === game.active) { continue; }

                                        var player = game.playerList[i];
                                        var resource = player.resource;
                            
                                        var sum = resource[Resource.BRICK]
                                                + resource[Resource.WOOL]
                                                + resource[Resource.ORE]
                                                + resource[Resource.GRAIN]
                                                + resource[Resource.LUMBER]
                                                + resource[Resource.CLOTH]
                                                + resource[Resource.COIN]
                                                + resource[Resource.PAPER];
                                        var vp = player.victoryPoint + player.bonusScore + player.baseScore;
                                        if (vp >= activeVp) {
                                            player.burst = Math.floor(sum / 2);
                                        } else {
                                            player.burst = 0;
                                        }
                                    }
                                    that.chat('?', 'deeppink', `「${CARD_NAME[index]}」を利用しました。`);
                                    Game.discardCard(game, game.active, Card.SABOTEUR);
                                    if(game.playerList.some(p => p.burst > 0)) {
                                        var priority = game.priority;
                                        priority.length = 0;
                            
                                        len1 = game.playerList.length;
                                        for (i = 0; i < len1; i++) {
                                            if (game.playerList[i].burst > 0) { priority.push(i); }
                                        }
                                        game.sound = Sound.BUILD;
                                        game.phase = Phase.SABOTEUR;
                                    } else {
                                        game.phase = Phase.MAIN;
                                    }
                                })(this);
                                break;                                
                            case Card.WEDDING:
                                (function (that) {
                                    var activePlayer = game.playerList[game.active];
                                    var activeVp = activePlayer.victoryPoint + activePlayer.bonusScore + activePlayer.baseScore;
                                    activePlayer.burst = 0;

                                    for (i = 0; i < game.playerSize; i++) {
                                        if(i === game.active) { continue; }

                                        var player = game.playerList[i];
                                        var resource = player.resource;
                            
                                        var sum = resource[Resource.BRICK]
                                                + resource[Resource.WOOL]
                                                + resource[Resource.ORE]
                                                + resource[Resource.GRAIN]
                                                + resource[Resource.LUMBER]
                                                + resource[Resource.CLOTH]
                                                + resource[Resource.COIN]
                                                + resource[Resource.PAPER];
                                        var vp = player.victoryPoint + player.bonusScore + player.baseScore;
                                        if (vp > activeVp) {
                                            player.burst = Math.min(sum, 2);
                                        } else {
                                            player.burst = 0;
                                        }
                                    }
                                    that.chat('?', 'deeppink', `「${CARD_NAME[index]}」を利用しました。`);
                                    Game.discardCard(game, game.active, Card.WEDDING);
                                    if(game.playerList.some(p => p.burst > 0)) {
                                        var priority = game.priority;
                                        priority.length = 0;
                            
                                        len1 = game.playerList.length;
                                        for (i = 0; i < len1; i++) {
                                            if (game.playerList[i].burst > 0) { priority.push(i); }
                                        }
                                        game.sound = Sound.BUILD;
                                        game.phase = Phase.WEDDING;
                                    } else {
                                        game.phase = Phase.MAIN;
                                    }
                                })(this);
                                break;                                
                            default:
                                break;
                        }
                        break;
                    case 'V':
                    case 'W':
                    case 'X':
                    case 'Y':
                    case 'Z':
                        break;
     
                }
            }
        }
        
        this.broadcast(JSON.stringify(this.game));
        this.game.sound = '';
    }
}

Kcataso.prototype.barbarianAttack = function() {
    var game = this.game;
    game.isBarbarianArrivedOnce = true;
    this.chat(
        '?'
      , 'deeppink'
      , '**蛮族襲来**'
    );

    var powerOfBarbarian = 0;
    for(var i = 0; i < game.settlementList.length; i++) {
        if ((game.settlementList[i] & 0xff00) >= SettlementRank.CITY) {
            powerOfBarbarian++;
        }
    }

    Game.strengthOfKnights(game);
    var powerOfKnight = game.playerList.reduce((sum, num) => sum + num.strengthOfKnights, 0);

    this.chat(
        '?'
      , 'deeppink'
      , `蛮族[${powerOfBarbarian}] vs カタソ島[${powerOfKnight}]`
    );
    return powerOfBarbarian <= powerOfKnight;
}

Kcataso.prototype.proceedDiceAction = function () {
    var i;
    var len1;
    var game = this.game;
    var diceSum = game.dice1 + game.dice2;
    game.noGainPlayer = [];
    if (diceSum === 7) {
        var playerSize = game.playerSize;

        var playerList = game.playerList;
        var isBurst = false;

        for (i = 0; i < playerSize; i++) {
            var player = playerList[i];
            var resource = player.resource;

            var sum = resource[Resource.BRICK]
                    + resource[Resource.WOOL]
                    + resource[Resource.ORE]
                    + resource[Resource.GRAIN]
                    + resource[Resource.LUMBER]
                    + resource[Resource.CLOTH]
                    + resource[Resource.COIN]
                    + resource[Resource.PAPER];

            if (sum > player.burstThreshold) {
                // DEBUGGING
                isBurst = true;
                player.burst = Math.floor(sum / 2);
            } else {
                player.burst = 0;
            }
        }
        
        if (isBurst) {
            var priority = game.priority;
            priority.length = 0;

            len1 = playerList.length;
            for (i = 0; i < len1; i++) {
                if (playerList[i].burst > 0) { priority.push(i); }
            }

            this.chat(
                  '?'
                , 'deeppink'
                , '**バースト発生**'
            );
            
            game.phase = Phase.BURST;
        } else {
            if(game.isBarbarianArrivedOnce) {
                game.phase = Phase.ROBBER1;
                game.sound = Sound.ROBBER;
            } else {
                // check card here.
                this.discardCardActionOrMain();
            }
        }
    } else {
        var numberList = game.numberList;
        var settlementList = game.settlementList;
        var landList = game.landList;

        var pool = [0, 0, 0, 0, 0, 0, 0, 0];
        var gainCount = [];
        for(let player = 0; player < game.playerSize; player++) {
            gainCount.push(0);
        }
        var rank;
        var color;

        var j;
        var len2;

        len1 = numberList.length;
        for (i = 0; i < len1; i++) {
            if (i !== game.robber && numberList[i] === diceSum) {
                len2 = LAND_LINK[i].length;
                for (j = 0; j < len2; j++) {
                    rank = settlementList[LAND_LINK[i][j]] & 0xff00;
                    color = settlementList[LAND_LINK[i][j]] & 0x00ff;
                    
                    if (rank !== SettlementRank.NONE) {
                        if (rank === SettlementRank.SETTLEMENT) {
                            pool[landList[i]]++;
                        } else {
                            switch(landList[i]) {
                                case Resource.WOOL:
                                    pool[landList[i]]++;
                                    pool[Resource.CLOTH]++;
                                    break;
                                case Resource.ORE:
                                    pool[landList[i]]++;
                                    pool[Resource.COIN]++;
                                    break;
                                case Resource.LUMBER:
                                    pool[landList[i]]++;
                                    pool[Resource.PAPER]++;
                                    break;
                                default:
                                    pool[landList[i]] += 2;
                                    break;
                            }
                        }
                    }
                }
            }
        }

        var resourceStock = game.resourceStock;

        for (i = 0; i < 8; i++) {
            if (resourceStock[i] - pool[i] < 0) {
                pool[i] = -1;
                
                this.chat(
                      '?'
                    , 'deeppink'
                    , '「' + RESOURCE_NAME[i] + '」不足のため生産に失敗'
                );
            }
        }

        len1 = numberList.length;
        for (i = 0; i < len1; i++) {
            if (i !== game.robber && numberList[i] === diceSum) {
                len2 = LAND_LINK[i].length;
                for (j = 0; j < len2; j++) {
                    rank = settlementList[LAND_LINK[i][j]] & 0xff00;
                    color = settlementList[LAND_LINK[i][j]] & 0x00ff;
                    
                    if (
                           rank !== SettlementRank.NONE
                        && pool[landList[i]] !== -1
                    ) {
                        gainCount[color]++;
                        if (rank === SettlementRank.SETTLEMENT) {
                            Game.gainResource(game, color, landList[i], 1);
                        } else {
                            Game.gainResourceCity(game, color, landList[i]);
                        }
                    }
                }
            }
        }

        game.noGainPlayer = gainCount
                            .map((count, index) => {
                                return {
                                    count: count,
                                    index: index
                                }
                            })
                            .filter(c => c.count === 0)
                            .filter(c => Game.hasSciencePower(game, c.index))
                            .map(c => c.index)
                            .sort((a , b) => {
                                let diffA = a-game.active;
                                if(diffA < 0) {
                                    diffA += 4;
                                }
                                let diffB = b-game.active;
                                if(diffB < 0) {
                                    diffB += 4;
                                }
                                return diffA - diffB;
                            });
        var resourceSum =  game.resourceStock[Resource.BRICK]
                           + game.resourceStock[Resource.WOOL]
                           + game.resourceStock[Resource.ORE]
                           + game.resourceStock[Resource.GRAIN]
                           + game.resourceStock[Resource.LUMBER];

        if(game.noGainPlayer.length !== 0 && resourceSum > 0) {
            var playerStrList = game.noGainPlayer.map(p => {
                return `「${game.playerList[p].uid}(${COLOR_NAME[p]})」`;
            });
            this.chat(
                '?'
                , 'deeppink'
                , `科学力ボーナス獲得: ${playerStrList.join(', ')}`
            );
            game.priority.length = 0;
            game.priority.push(game.noGainPlayer.shift());
            game.phase = Phase.GAIN_RESOURCE;
        } else {
            // check card here.
            this.discardCardActionOrMain();
        }
        
        game.sound = Sound.DICE;
    }  
}

Kcataso.prototype.afterBarbarian = function () {
    var game = this.game;
    for(let index = 0; index < game.knightList.length; index++) {
        Game.deactivateKnight(game, index);
    }
    Game.proceedBarbarian(game);
    this.proceedDiceAction();
}

Kcataso.prototype.diceRoll = function () {
    var game = this.game;

    if (game.phase === Phase.DICE) {
        var dice = this.dice;

        Dice.roll(dice);


        game.dice1 = dice.first;
        game.dice2 = dice.seccond;
        if(game.alchemistDice1 !== Index.NONE) {
            game.dice1 = game.alchemistDice1;
            game.dice2 = game.alchemistDice2;
        }
        game.event = dice.event;
        
        var diceSum = game.dice1 + game.dice2;
        game.diceHistory.push(diceSum);
        var eventType = game.event - 3;
        game.eventHistory.push(Math.max(0, eventType));
        
        this.chat(
            '?'
            , 'deeppink'
            , 'ダイス「' + diceSum + '」'
            );
        if(game.event <= Event.BARBARIAN) {
            Game.proceedBarbarian(game);
            if (game.barbarianPos === 7) {

                var save = this.barbarianAttack();
                if(save) {
                    this.chat(
                        '?'
                        , 'deeppink'
                        , '島の勝利'
                    );
                    if(game.strongestKnightsPlayer.length === 1) {
                        game.phase = Phase.BARBARIAN_SAVE1;
                        game.playerList[game.strongestKnightsPlayer[0]].victoryPoint += 1;
                        this.chat(
                            '?'
                          , 'deeppink'
                        , `「${game.playerList[game.strongestKnightsPlayer[0]].uid}(${COLOR_NAME[game.strongestKnightsPlayer[0]]})」が勝利ポイントを獲得`
                        );
                    } else if(game.strongestKnightsPlayer.length > 1) {
                        game.phase = Phase.BARBARIAN_SAVE2;
                        game.priority.length = 0;
                        game.priority.push(game.strongestKnightsPlayer.shift());
                    }
                    game.sound = Sound.GET;
                } else {
                    this.chat(
                        '?'
                        , 'deeppink'
                        , '島の敗北'
                    );
                    if(game.weakestKnightsPlayer.length !== 0) {
                        game.phase = Phase.BARBARIAN_DEFEAT1;
                        game.sound = Sound.ROBBER;
                        game.priority.length = 0;
                        game.priority.push(game.weakestKnightsPlayer.shift());
                    } else {
                        this.afterBarbarian();
                    }
                }
                return;
            }
        } else {
            this.proceedCardAction();
        }
        this.proceedDiceAction();
    }
}

Kcataso.prototype.proceedCardAction = function () {
    var game = this.game;
    let developmentType;
    if(game.event === Event.BLUE) {
        developmentType = Development.POLITICS;
    } else if(game.event === Event.GREEN) {
        developmentType = Development.SCIENCE;
    } else if (game.event === Event.YELLOW) {
        developmentType = Development.TRADE;
    }

    for(let player = 0; player < game.playerSize; player++) {
        if(Game.canGetCard(game, player, game.dice2, developmentType)) {
            var nextCard = Game.getCard(game, player, developmentType);
            if(nextCard === Card.PRINTER || nextCard === Card.CONSTITUTION) {
                this.chat('?', 'deeppink', `ポイントカード「${CARD_NAME[nextCard]}」を引きました。`);
            }
        }
    }
}

Kcataso.prototype.goToNextPlayer = function () {
    var game = this.game;
    var active = game.active;
    var playerList = game.playerList;
    for(let i = 0; i < game.knightList.length; i++) {
        if(Game.isKnightActive(game, i)) {
            Game.makeKnightActive(game, i);
        }
        game.knightList[i] &= KnightStatus.OFF_PROMOTED;
    }

    game.dice1 = game.dice2 = Index.NONE;
    game.alchemistDice1 = Index.NONE;
    game.alchemistDice2 = Index.NONE;
    game.playerList[game.active].merchantFleetResource = [];
    active = game.active = (active + 1) % game.playerSize;

    var priority = game.priority;
    priority.length = 0;
    priority.push(game.active);
    
    this.chat(
          '?'
        , 'orange'
        , '--「' + playerList[active].uid + '(' + COLOR_NAME[active] + ')」ターン--'
    );

    game.phase = Phase.DICE;
    game.sound = Sound.PASS;

}

Kcataso.prototype.discardCardActionOrMain = function () {
    let game = this.game;
    game.needDiscardCardPlayer = game.playerList.map((p, i) => {
                                    return {
                                        card: p.progressCard,
                                        index: i
                                    };
                                })
                                .filter(p => p.index !== game.active)
                                .filter(p => p.card.length > 4)
                                .map(p => p.index)
                                .sort((a , b) => {
                                    let diffA = a-game.active;
                                    if(diffA < 0) {
                                        diffA += 4;
                                    }
                                    let diffB = b-game.active;
                                    if(diffB < 0) {
                                        diffB += 4;
                                    }
                                    return diffA - diffB;
                                });
    if(game.needDiscardCardPlayer.length !== 0) {
        game.priority.length = 0;
        game.priority.push(game.needDiscardCardPlayer.shift());
        game.phase = Phase.DISCARD_CARD_OTHER;
    } else {
        game.phase = Phase.MAIN;
    }
}

Kcataso.prototype.pillageAll = function (game, index) {
    const losePlayers = [...new Set(LAND_LINK[index].map(i => game.settlementList[i]).map(s => s & 0xff).filter(p => p !== game.active && p !== 0xff && Game.hasResource(game.playerList[p])))];
    if(losePlayers.length !== 0) {
        const tmp = losePlayers.map(p => `「${game.playerList[p].uid}(${COLOR_NAME[p]})」`);
        this.chat(
            '?'
          , 'deeppink'
          , `資源の略奪 ${tmp.join(',')}`
        );
    }
    losePlayers.forEach(p => {
        if(Game.hasResource(game.playerList[p])) {
    
          var loseResource = game.playerList[p].resource;
          var tmp = [];

          var i;
          var len1 = loseResource.length;
          for (i = 0; i < len1; i++) {
              var j;
              var len2 = loseResource[i];
              for (j = 0; j < len2; j++) { tmp.push(i); }
          }

          if(tmp.length === 1) {
              i = tmp[0];
          } else {
              i = tmp[this.mt.nextInt(0, tmp.length - 1)];
          }

          loseResource[i]--;
          game.playerList[game.active].resource[i]++;
        }
    });
}


module.exports = Kcataso;