(function() {

var Game = function (application, pGameType, pGameState) {

  //store a private reference to the application
  var _app = application;
  var _isServer = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
  var _cards = {};
  var _stacks = {};
  var _baseConfig = {
    id:"",
    title:"",
    minPlayers:4,
    maxPlayers:4,
    trumps:[],
    description:"",
    rules:"",
    betInfo:{ buyIn:0, maxBuyIns:1, minBet:0, ante:0 },
    bidInfo:{ rounds:0, minBid:0, maxBid:0, prompt:"" },
    decks:{ full:1 },
    joker:0,
    css:"",
    display:[["*[area='p1']","hand","owner"],["*[area='t1']","deck","everyone"],["*[area='t1']","discard","everyone"],["*[area='t1']","shared","everyone"],["*[area='t2']","hand","everyone"]],
    chat:[],
    gameMenu:[]
  }

  //define private config variable to hold property values
  var _var = {
    key:_app.randomCode(8, "G"),
    mode:"",
    trump:"",
    bid:0,
    upCard:{ key:"", stack:"", turnedDown:false },
    players:[],
    dealerKey:_app.user.key,
    activeKey:_app.user.key,
    highKey:"",
    gameType:((typeof pGameType === "string") && (typeof _app.gameConfigs[pGameType] === "object")) ? pGameType : "",
    lastUpdate:Date.now(),
    lastRefresh:0
  };

  /****** STATE AN UI MANAGEMENT ******/
  Object.defineProperty(this,"toJSON",{
    /**
     * Purpose: Return a hash of state variables as JSON which can be used
     *  to reinstantiate an exact copy of this object by reapplying to state
     *
     * @return {object} all private state variables serialized to JSON
     **/
    value:function() {
      return this.state;
    },
    enumerable: false
  });

  Object.defineProperty(this,"state",{
    /**
     * Purpose: Sets update timestamp and private state variables, if 'ready'
     *  variable changes to true the entire UI is also refreshed.
     *
     * @param {object} value A hash of private variables to be updated
     *
     * @return {object} Hash of all private state variables serialized to JSON
     **/
    get: function() {
      var obj = {
        key:_var.key,
        mode:_var.mode,
        trump:_var.trump,
        bid:_var.bid,
        upCard:_var.upCard,
        players:_var.players,
        dealerKey:_var.dealerKey,
        activeKey:_var.activeKey,
        highKey:_var.highKey,
        gameType:_var.gameType,
        lastUpdate:_var.lastUpdate,
        ready:_var.ready,
        cardState:Object.values(_cards).map((v) => v.state),
        stackState:Object.values(_stacks).map((v) => v.state)
      }
      return obj;
    },
    set: function(value) {
      console.log("game.state", value);
      var isDirty = false;

      //Now update any other property states
      for (var k in value) {
        switch (k) {
          case "cardState":
            //Apply Card states, could be none, some or all cards
            //we are non-destructive to unspecified cards
            if (Array.isArray(value["cardState"])) {
              value.cardState.forEach((v) => {
                if (typeof _cards[v.key] === "object") {
                  _cards[v.key].state = v;
                }
              })
            }
            break;
          case "stackState":
            //Apply Stack states, could be none, some or all stacks
            //we are non-destructive to unspecified stacks
            if (Array.isArray(value["stackState"])) {
              value.stackState.forEach((v) => {
                if (typeof _stacks[v.key] === "object") {
                  _stacks[v.key].state = v;
                }
              });
            }
            break;
          case "playerState":
            //Apply Player states, could be none, some or all players
            //we are non-destructive to unspecified players
            if (Array.isArray(value["playerState"])) {
              isDirty = true;
              value.playerState.forEach((ps) => {
                var p = ps;
                var idx = _var.players.findIndex((v) => (v.key == p.key));
                if (idx == -1) {
                  //add a new player item
                  _var.players.push(p)
                } else {
                  //extend the existing player item
                  _var.players[idx] = Object.assign({}, _var.players[idx], p);
                }
              })
            }
            break;
          default:
            if ((typeof _var[k] !== "undefined") && (_var[k] !== value[k])) {
              isDirty = true;
              _var[k] = value[k];
            }
            break;
        }
      }

      //make sure last updated is set to now or specified timestamp
      _var.lastUpdate = (typeof value.lastUpdate !== "number") ? value.lastUpdate : Date.now();

    },
    enumerable: false
  });

  Object.defineProperty(this,"lastUpdate",{
    /**
     * Purpose: Passes state changes to other clients and sets timestamp of last change.
     *
     * @param {number}  [pushState] New value for last update timestamp.
     * @param {boolean} [pushState] When true entire object state is sent.
     * @param {Object}  [pushState] Hash of state variable name/values to send.
     *
     * @return {number}  The last time object was updated in Date msecs.
     **/
    get: function() {
      return (typeof _var.lastUpdate == "number") ? _var.lastUpdate : 0
    },
    set: function(pushState) {
      _var.lastUpdate = (typeof pushState === "number") ? pushState : Date.now();
      //Game object is actually never used on the server, but check for consistency
      var socket = (_app.key === "SERVER") ? _app.io.to(_var.key) : _app.io;
      //Now process the data to send
      if (_app.ready === false) {
        //don't send state when initializing
      } else if (pushState === true) {
        //if true passed, then send the entire state of the object
        socket.emit("state", "game", _var.key, this.state);
      } else if (typeof pushState === "object") {
        //otherwise send just the specified property changes
        socket.emit("state", "game", _var.key, pushState);
      } else {
        //if something other than true or an update object were sent log the error
        if (typeof pushState !== "number") {
          console.log("Invalid type (" + typeof pushState + ") lastUpdate", pushState);
        }
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"lastRefresh",{
    /**
     * Purpose: Used with lastUpdate to determine if object's UI needs refreshed.
     *
     * @return {number}  The last time object UI was refreshed in Date msecs.
     **/
    get: function() { return (typeof _var.lastRefresh == "number") ? _var.lastRefresh : 0 },
    enumerable: false
  });

  Object.defineProperty(this,"refreshUI",{
    /**
     * Purpose: Used with lastUpdate to determine if object's UI needs refreshed.
     *
     * @return {number}  The last time object UI was refreshed in Date msecs.
     **/
    value:function(refreshAll) {
      console.log('game.refreshUI');
      if (!_app.ready) {  return; }
      var k;
      var after = _var.lastRefresh;
      var before = Date.now();
      var forceRefresh = (refreshAll === true);
      _var.lastRefresh = before;
      //each stack will call to refresh card state of each of its cards
      for (k in _stacks) {
        console.log("refreshing stack", k, forceRefresh);
        _stacks[k].refreshUI(forceRefresh);
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"key",{
    get: function() { return _var.key; },
    set: function(value) { _var.key = value; },
    enumerable: false
  });

  Object.defineProperty(this,"seats",{
    get: function() {
      var gameConfig = this.config;
      var seats = [];
      var maxPlayers = (typeof gameConfig.maxPlayers === "number") ? gameConfig.maxPlayers : 4;
      //get all users in the room so we can add new players to empty seats
      var userlist = ((typeof _app.room === "object") && (typeof _app.room.users === "object")) ? Object.values(_app.room.users).map((v) => ({ key:v.key, name:v.name })) : [];
      //remove existing players from the list of available users
      userlist = userlist.filter((v) => (typeof _app.game.getPlayer(v.key) !== "object"));
      for (var x = 0; x < maxPlayers; x++) {
        var seat = Object.assign({}, _app.protoPlayer);
        if (_var.players.length > x) {
          seat = Object.assign(seat, _app.room.users[_var.players[x].key].state, _var.players[x]);
        } else if (userlist.length > 0) {
          console.log(userlist);
          var u = userlist.pop();
          seat = Object.assign(seat, u.state);
        }
        seat = Object.assign(seat, { index:x, position:(x + 1)})
        seats.push(seat);
      }
      return seats;
    },
    enumerable: false
  });

  Object.defineProperty(this,"mode",{
    get: function() { return _var.mode; },
    set: function(value) {
      if ((typeof value === "string") && (_var.mode !== value)) {
        _var.mode = value;
        _var.lastUpdate = { mode:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"bidInfo",{
    get: function() { return _var.bidInfo; },
    set: function(value) {
      if ((typeof value === "object") && (_var.bidInfo !== value)) {
        _var.bidInfo = Object.assign(_var.bidInfo, value);
        _var.lastUpdate = { bidInfo:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"betInfo",{
    get: function() { return _var.betInfo; },
    set: function(value) {
      if ((typeof value === "object") && (_var.betInfo !== value)) {
        _var.betInfo = Object.assign(_var.betInfo, value);
        _var.lastUpdate = { betInfo:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"trump",{
    get: function() {
      return _var.trump;
    },
    set: function(value) {
      if ((typeof value === "string") && (_var.trump !== value)) {
        _var.trump = value;
        _var.lastUpdate = { trump:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"bid",{
    get: function() {
      return _var.bid;
    },
    set: function(value) {
      if ((typeof value === "string") && (_var.bid !== value)) {
        _var.bid = value;
        _var.lastUpdate = { bid:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"upCard",{
    get: function() {
      return this.getCard(_var.upCardKey);
    },
    set: function(value) {
      var newCardKey = (typeof value === "object") ? value.key : (typeof value === "string") ? value : "";
      if (_var.upCardKey !== newCardKey) {
        _var.upCardKey = value;
        _var.lastUpdate = { upCardKey:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"display",{
    get: function() {
      return this.config.display;
    },
    enumerable: false
  });

  Object.defineProperty(this,"title",{
    get: function() {
      return this.config.title;
    },
    enumerable: false
  });

  Object.defineProperty(this,"description",{
    get: function() {
      return this.config.description;
    },
    enumerable: false
  });

  Object.defineProperty(this,"rules",{
    get: function() {
      return this.config.rules;
    },
    enumerable: false
  });

  Object.defineProperty(this,"css",{
    get: function() {
      return this.config.css;
    },
    enumerable: false
  });

  Object.defineProperty(this,"trumps",{
    get: function() {
      return this.config.trumps;
    },
    enumerable: false
  });

  Object.defineProperty(this,"players",{
    get: function() {
      //return the actual player object for each key in the array
      return _var.players;
    },
    set: function(value) {
      //Accepts eithe array of playerKeys or player objects and converts to array of playerKeys
      if ((_var.players !== value) && (Array.isArray(value))) {
        _var.players = value;
        _var.lastUpdate = { players:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"getPlayer",{
    value:function(playerKey) {
      var idx = _var.players.findIndex((v) => v.key === playerKey);
      return (idx >= 0) ? _var.players[idx] : undefined;
    },
    enumerable: false
  });

  Object.defineProperty(this,"host",{
    get: function() {
      var playerKey = (typeof _app.room === "object") ? _app.room.hostKey : "";
      var player = this.getPlayer(playerKey);
      return (typeof player === "object") ? player : { key:playerKey, name:playerKey };
    },
    enumerable: false
  });

  Object.defineProperty(this,"isHost",{
    value:function(user) {
      return ((typeof _app.room === "object") && (typeof _app.user === "object") && (_app.room.hostKey === _app.user.key))
    },
    enumerable: false
  });

  //Returns the dealer player if there is one, otherwise host
  Object.defineProperty(this,"dealer",{
    get: function() {
      var playerKey = (_var.dealerKey != "") ? _var.dealerKey : this.hostKey;
      var player = this.getPlayer(playerKey);
      return (typeof player === "object") ? player : { key:playerKey, name:playerKey };
    },
    set: function(pValue) {
      var value = (typeof pValue === "object") ? pValue.key : (typeof pValue === "string") ? pValue : "";
      if (_var.dealerKey !== value) {
        _var.dealerKey = value;
        _var.lastUpdate = { dealerKey:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"isDealer",{
    value:function(user) {
      var userKey = (typeof user === "object") ? user.key : ((typeof user === "string") && (user !== "")) ? user : _app.user.key;
      return (userKey == _var.dealerKey);
    },
    enumerable: false
  });

  //Returns the active player if there is one, otherwise dealer or host
  Object.defineProperty(this,"active",{
    get: function() {
      var playerKey = (_var.activeKey != "") ? _var.activeKey : (_var.dealerKey != "") ? _var.dealerKey : this.hostKey;
      var player = this.getPlayer(playerKey);
      return (typeof player === "object") ? player : { key:playerKey, name:playerKey };
    },
    set: function(value) {
      var value = (typeof pValue === "object") ? pValue.key : (typeof pValue === "string") ? pValue : "";
      if (_var.activeKey !== value) {
        _var.activeKey = value;
        _var.lastUpdate = { activeKey:value };
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"isActive",{
    value:function(user) {
      var userKey = (typeof user === "object") ? user.key : ((typeof user === "string") && (user !== "")) ? user : _app.user.key;
      return (userKey == _var.activeKey);
    },
    enumerable: false
  });

  //Returns the high hand/bet player if there is one, otherwise first player after dealer
  Object.defineProperty(this,"high",{
    get: function() {
      var playerKey = _var.highKey;
      var player = this.getPlayer(playerKey);
      return (typeof player === "object") ? player : { key:playerKey, name:playerKey };
    },
    set: function(value) {
      var value = (typeof pValue === "object") ? pValue.key : (typeof pValue === "string") ? pValue : "";
      if (_var.highKey !== value) {
        _var.highKey = value;
        _var.lastUpdate = { highKey:value };
      }
    },
    enumerable: false
  });

  //Returns true if user is the high better, which is set automatically by betting functions
  Object.defineProperty(this,"isHigh",{
    value:function(user) {
      var userKey = (typeof user === "object") ? user.key : ((typeof user === "string") && (user !== "")) ? user : _app.user.key;
      return (userKey == _var.highKey);
    },
    enumerable: false
  });

  Object.defineProperty(this,"stacks",{
    get: function() { return _stacks; },
    //set: function(value) { _stacks = value; },
    enumerable: false
  });

  Object.defineProperty(this,"cards",{
    get: function() { return _cards; },
    //set: function(value) { _cards = value; },
    enumerable: false
  });

  Object.defineProperty(this,"config",{
    get: function() {
      var config = Object.assign({}, _baseConfig, _app.gameConfigs[_var.gameType] );
      return config;
    },
    enumerable: false
  });

  /****** Constants ******/
  Object.defineProperty(this,"defaultActions",{
    value:{
      /* Everyone Actions */
      scores: { key:"scores", label:"Scores", menu:"game", filter:{ }, options:{ id:"dlgScores" }, method:"showDialog" },
      rules: { key:"rules", label:"Rules", menu:"game", filter:{ }, options:{ id:"dlgRules" }, method:"showDialog" },
      leave_game: { key:"leave_game", label:"Leave Game", menu:"game", filter:{ actor:"host" }, options:{}, method:"leaveGame" },
      /* Host Actions */
      settings: { key:"settings", label:"Game Settings", menu:"game", filter:{ actor:"host" }, options:{ id:"dlgGameSettings" }, method:"showDialog" },
      players: { key:"players", label:"Players", menu:"game", filter:{ actor:"host" }, options:{ id:"dlgPlayers" }, method:"showDialog" },
      new_deal: { key:"new_deal", label:"New Deal", menu:"game", filter:{ actor:"host" }, options:{}, method:"newDeal" },
      new_game: { key:"new_game", label:"New Game", menu:"game", filter:{ actor:"host" }, options:{ id:"dlgGamesMenu" }, method:"showDialog" },
      /* Dealer Actions */
      reshuffle: { key:"shuffle", label:"Shuffle Deck", menu:"game", filter:{ actor:"dealer" }, options:{ from_stack:"discard", to_stack:"deck" }, method:"reshuffle" },
      deal: { key:"deal", label:"Deal", menu:"game", filter:{ actor:"dealer" }, options:{ from_stack:"deck", to_stack:"hand", face:"down", count:1 }, method:"deal" },
      deal_settings: { key:"deal_settings", label:"Deal &hellip;", menu:"game", filter:{ actor:"dealer" }, options:{ id:"dlgDeal" }, method:"showDialog" },
      start_turn: { key:"start_turn", label:"Next Player &hellip;", menu:"game", filter:{ actor:"dealer" }, options:{ player:"prompt" }, method:"startTurn" },
      /* Player Actions */
      draw: { key:"draw", label:"Draw", menu:"game", filter:{ actor:"player", minSel:1 }, options:{ mode:"replace", from_stack:"deck", to_stack:"hand", discard_stack:"discard", face:"default" }, method:"draw" },
      draw_one: { key:"draw_one", label:"Draw Card", menu:"game", filter:{ actor:"player", minCards:1 }, options:{ mode:"add", from_stack:"deck", to_stack:"hand", face:"default" }, method:"draw" },
      pick_up: { key:"pick_up", label:"Pick Up", menu:"game", filter:{ actor:"player", minSel:1 }, options:{ from_stack:"discard", to_stack:"hand", face:"default" }, method:"pickUp" },
      play: { key:"play", label:"Pick Up", menu:"game", filter:{ actor:"player", minSel:1 }, options:{ from_stack:"hand", to_stack:"table", face:"up" }, method:"play" },
      discard: { key:"discard", label:"Discard", menu:"game", filter:{ actor:"player", minSel:1 }, options:{ from_stack:"hand", to_stack:"discard", face:"down" }, method:"play" },
      bid: { key:"bid", label:"Bid &hellip;", menu:"game", filter:{ actor:"player" }, options:{ mode:"dialog" }, method:"bid" },
      bid_pass: { key:"bid_pass", label:"Pass", menu:"game", filter:{ actor:"player" }, options:{ mode:"pass" }, method:"bid" },
      claim: { key:"claim", label:"Claim", menu:"game", filter:{ actor:"player", minCards:2 }, options:{ from_stack:"table", to_stack:"tricks" }, method:"claim" },
      bet_check: { key:"bet_check", label:"Check", menu:"game", filter:{ actor:"player", maxBet:0 }, options:{ mode:"check" }, method:"bet" },
      bet_call: { key:"bet_call", label:"Call", menu:"game", filter:{ actor:"player", minBet:1 }, options:{ mode:"call" }, method:"bet" },
      bet_min: { key:"bet_min", label:"Bet Minimum", menu:"game", filter:{ actor:"player", minBet:1 }, options:{ mode:"min" }, method:"bet" },
      bet_max: { key:"bet_max", label:"Bet Maximum", menu:"game", filter:{ actor:"player" }, options:{ actor:"player", mode:"max" }, method:"bet" },
      bet: { key:"bet", label:"Bet &hellip;", menu:"game", filter:{ actor:"player" }, options:{ mode:"dialog" }, method:"bet" },
      end_turn: { key:"end_turn", label:"End Turn", menu:"game", filter:{ actor:"player" }, options:{ id:"next", actor:"player" }, method:"endTurn" },
      /* Stack Actions */
      sort_suit: { key:"sort_suit", label:"Group by Suit", menu:"stack", filter:{ minCards:3 }, options:{ sort:"suit" }, method:"sort" },
      sort_rank: { key:"sort_rank", label:"Group by Rank", menu:"stack", filter:{ minCards:3 }, options:{ sort:"rank" }, method:"sort" },
      sort_group: { key:"sort_group", label:"Group Selected", menu:"stack", filter:{ minSel:2 }, options:{ sort:"group" }, method:"sort" },
      select_all: { key:"select_all", label:"Select All", menu:"stack", filter:{ minCards:1 }, options:{ select:"all" }, method:"select" },
      unselect_all: { key:"unselect_all", label:"Unselect All", menu:"stack", filter:{ minCards:1 }, options:{ select:"none" }, method:"select" },
      flip: { key:"flip", label:"Turn Over", menu:"stack", filter:{ minSel:1 }, options:{ face:"flip", mode:"selected" }, method:"flip" },
      turn_up: { key:"turn_up", label:"Reveal", menu:"stack", filter:{ maxSel:0 }, options:{ face:"up", mode:"all" }, method:"flip" },
      turn_down: { key:"turn_down", label:"Turn Down", menu:"stack", filter:{ maxSel:0 }, options:{ face:"down", mode:"all" }, method:"flip" },
      pass_cards: { key:"pass_cards", label:"Pass Cards", menu:"game", filter:{ minSel:1 }, options:{ mode:"dialog" }, method:"pass" },
      move: { key:"move", label:"Move Selected &hellip;", menu:"game", filter:{ minSel:1 }, options:{ mode:"dialog" }, method:"move" },
      move_all: { key:"move", label:"Move All &hellip;", menu:"game", filter:{ maxSel:0 }, options:{ mode:"dialog" }, method:"move" }
    },
    enumerable: false
  });

  /****** Functions ******/

  Object.defineProperty(this,"nextPlayer",{
    value:function (relPlayer, relOffset, paramSkipFolded) {
      var relPlayerKey = (typeof relPlayer === "object") ? relPlayer.key : ((typeof relPlayer === "string") && (relPlayer != "")) ? relPlayer : (_var.activeKey != "") ? _var.activeKey : (_var.dealerKey != "") ? _var.dealerKey : this.hostKey;
      var offset = (typeof relOffset === "number") ? relOffset : 1;
      var skipFolder = (typeof paramSkipFolded === "boolean") ? paramSkipFolded : true;
      var players = _var.players;
      var nextP;
      if (skipFolded) {
        //remove folded players other than the relative player from the array
        players = players.filter((v) => ((v.key == relPlayerKey) || (v["folded"] !== true)));
      }
      //find the index of the relative player in the array
      var idx = players.findIndex((v) => v.key == relPlayerKey);
      if (idx == -1) {
        nextP = this.dealer;
      } else if (offset == 0) {
        nextP = players[idx];
      } else if (players.length == 1) {
        nextP = players[0];
      } else if (idx == (players.length - 1)) {
        nextP = players[0];
      } else {
        nextP = players[idx + 1];
      }
      //update the activeKey to new player key
      _var.activeKey = (typeof nextP == "object") ? nextP.key : "";
      //mark that UI needs updating
      _var.lastUpdate = Date.now();
      //return the next player object
      return nextP;
    },
    enumerable: false
  });

  Object.defineProperty(this,"getCard",{
    value:function(cardId) {
      return (typeof cardId == "object") ? cardId : (typeof _cards[cardId] == "object") ? _cards[cardId] : null;
    },
    enumerable: false
  });

  Object.defineProperty(this,"getStack",{
    value:function(stackId) {
      //accepts either stack object for stackId and returns stack object
      if (typeof stackId == "object") {
        return stackId
      } else {
        return _stacks[stackId];
      }
    },
    enumerable: false
  });

  Object.defineProperty(this,"initCards",{
    value:function() {

      //Rebuilds the cards collection based on game config
      var gameConfig = this.config;
      var deckTypeId = "";
      var face = "down";

      /***** RESET card arrays and collections *************/
      _cards = {}
      cards = _cards;

      /***** REBUILD CARDS COLLECTION *************/

      //use a single full deck as the default
      if (typeof gameConfig.decks == "undefined") { gameConfig["decks"] = "full"; }

      //use 0 as default for number of jokers per deck
      if (typeof gameConfig.jokers != "number") { gameConfig["jokers"] = 0; }

      var _decks = gameConfig["decks"];

      //if decks was a string, interpret as a deckType id
      if (typeof _decks != "object") {
        deckTypeId = ((typeof _decks == "string") && (_decks != "")) ? _decks : "full";
        _decks = {};
        _decks[deckTypeId] = 1;
      }

      //add jokers to the end of the deck if jokers settings is greater than 0
      if ((typeof gameConfig.jokers == "number") && (gameConfig.jokers > 0)) {
        _decks["jokers"] = gameConfig.jokers;
      }

      var o = 0; //used to set the rank order of each card type
      var deckPrefix = 0;
      for ( deckTypeId in _decks) {
        if (typeof _app.deckConfigs[deckTypeId] == "object") {
          deckPrefix++;
          var deck = _app.deckConfigs[deckTypeId].filter(v => true);
          //get the number of decks specified
          var numDecks = _decks[deckTypeId];
          //for each card type, multiply # of cards by number of decks (assuming 1 card if unspecified)
          deck.forEach((c) => c['n'] = (typeof c['n'] == 'number') ? c['n'] * numDecks : numDecks )
          //iterate over each cardType adding the specified number of cards to the cards collection
          for (var c=0; c < deck.length; c++) {
            //is number of cards to include in deck of this type
            //increment rank order for each new card type (assumes cards are in ascending rank order)
            var opt = Object.assign({ n:1, o:o++ }, deck[c], { key:'d' + deckPrefix + deck[c].id, stack:"deck", face:face, selected:false })
            //now add the specfified number of cards of this type to the cards collection
            for (var n=0; n < opt.n; n++) {
              opt.key = 'd' + deckPrefix + deck[c].id + n;
              var card = new Card(_app, opt);
              //add to cards collection
              cards[card.key] = card;
            }
          }
        }
      }

      console.log("initCards", cards);

    },
    enumerable: false
  });

  Object.defineProperty(this,"sortByFace",{
    value:function(cardsToSort) {
      var _this = this;
      cardsToSort.sort(function(a, b){
        var cardA = (typeof a == "string") ? _this.getCard(a) : a;
        var cardB = (typeof b == "string") ? _this.getCard(b) : b;
        var i = (cardA.face == cardB.face) ? 0 : (cardA.face === "up") ? -1 : 1;
        return i;
      });
      return cardsToSort;
    },
    enumerable: false
  });

  Object.defineProperty(this,"sortByRank",{
    value:function(cardsToSort) {
      var _this = this;
      cardsToSort.sort(function(a, b){
        var cardA = (typeof a == "string") ? _this.getCard(a) : a;
        var cardB = (typeof b == "string") ? _this.getCard(b) : b;
        var i = (cardA.suit == cardB.suit) ? 0 : (cardA.suit < cardB.suit) ? -1 : 1;
        return i;
      });
      cardsToSort.sort(function(a, b){
        var cardA = (typeof a == "string") ? _this.getCard(a) : a;
        var cardB = (typeof b == "string") ? _this.getCard(b) : b;
        return cardA.rankOrder - cardB.rankOrder;
      });
      return cardsToSort;
    },
    enumerable: false
  });

  Object.defineProperty(this,"sortBySuit",{
    value:function(cardsToSort) {
      var _this = this;
      cardsToSort.sort(function(a, b){
        var cardA = (typeof a == "string") ? _this.getCard(a) : a;
        var cardB = (typeof b == "string") ? _this.getCard(b) : b;
        return cardA.rankOrder - cardB.rankOrder;
      });
      cardsToSort.sort(function(a, b){
        var cardA = (typeof a == "string") ? _this.getCard(a) : a;
        var cardB = (typeof b == "string") ? _this.getCard(b) : b;
        var i = (cardA.suit == cardB.suit) ? 0 : (cardA.suit < cardB.suit) ? -1 : 1;
        return i;
      });
      return cardsToSort;
    },
    enumerable: false
  });

  Object.defineProperty(this,"sortBySelection",{
    value:function(cardsToSort) {
      var _this = this;
      var arrSel = cardsToSort.filter(function (v) { var c=(typeof v == "string") ? _app.getCard(v) : v; return c.selected === true; });
      for (var x=cardsToSort.length-1; x>=0; x--) {
        var card = (typeof cardsToSort[x] == "string") ? _this.getCard(cardsToSort[x]) : cardsToSort[x];
        if (card.selected) { cardsToSort.splice(x, 1);}
      }
      for (var x=arrSel.length-1; x>=0; x--) {
        cardsToSort.unshift(arrSel[x]);
      }
      return cardsToSort;
    },
    enumerable: false
  });

  Object.defineProperty(this,"initPlayers",{
    value:function(pPlayers, pDesiredPlayers) {
      var player, roomUsers;
      var optAdd = {};
      var optReset = { folded:false, active:false, high:false, opener:false };
      var config = this.config;
      var dealerKey = config.dealerKey;
      var desiredPlayers = (typeof pDesiredPlayers === "number") ? pDesiredPlayers : (Array.isArray(pPlayers)) ? pPlayers.length : config.maxPlayers;
      var players = (Array.isArray(pPlayers)) ? pPlayers.slice() : _var.players.slice();
      var room = (typeof _app.room === "object") ? _app.room : { users:{} };

      //if more players than allowed or desired
      while (players.length > Math.min(desiredPlayers, config.maxPlayers)) {
        player = players.pop();
        //tell player they were removed
      }

      //if we have fewer than desired number of players, try to add from room.users
      if (players.length < Math.max(desiredPlayers, config.minPlayers)) {
        //get a list of keys and names of all users in room
        roomUsers = Object.values(room.users).map((v) => (Object.assign({key:v.key, name:v.name})));
        //remove users who are already in players array
        roomUsers = roomUsers.filter(function(v){
          var key = v.key;
          var idx = players.findIndex((p) => (p.key === key));
          return (idx == -1);
        });
        while ((roomUsers.length > 0) && (players.length < Math.max(desiredPlayers, config.minPlayers))) {
          player = roomUsers.pop();
          players.push(player);
          //tell everyone player has joined the game
        }
      }

      //preserve player information, but make sure required data is included
      players = players.map(function (v) {
        p = Object.assign({}, _app.protoPlayer, optAdd, (typeof v === "string") ? { key:v } : v, optReset );
        //User previous dealer if none specified
        if ((dealerKey === "") && (p.dealer === true)) { dealerKey = p.key; }
        //always get name from room.users
        p.name = (typeof room.users[p.key] === "object") ? room.users[p.key].name : p.key;
        p.dealer = (p.key === dealerKey);
        return p;
      });

      //If dealer not actual found, reset dealerKey to empty string
      if ((dealerKey !== "") && (players.findIndex((v) => (v.key === dealerKey)) != -1)) {
        dealerKey = "";
      }

      //Set first player to dealer if none specified
      if ((dealerKey === "") && (players.length > 0)) {
        players[0].dealer = true;
      }

      _var.players = players;
    },
    enumerable: false
  });

  Object.defineProperty(this,"initStacks",{
    value:function(pConfig) {
      //use passed stackConfig array
      var arrStackConfigs = (Array.isArray(pConfig)) ? pConfig.slice() : ((typeof pConfig === "object") && (Array.isArray(pConfig['stacks']))) ? pConfig.stacks.slice() : ((typeof pConfig === "string") && (typeof _app.gameConfigs[pConfig] === "object")) ? _app.gameConfigs[pConfig].stacks : this.config.stacks;
      var arrCfg = []; //holds expanded config files to process
      var players = _var.players;
      var arrState, cards, availCards, stack, group, cfg, card;
      var x, p, k, n;

      _stacks = {}
      var stacks = _stacks;

      //Deck Defaults
      stacks["deck"] = new Stack(_app, {
          key:"deck", label:"Deck", group:"deck", shared:true, layout:"stack", face:"down", initUp:0, initDown:0, cardAction:"select",
          actions:[
            { key:"deal", label:"Deal", menu:"stack", fn:"deal", obj:"stack", cards:"stack", groups:["hand:*"], filters:{ dealer:true, minCards:1 }, options:{} },
            { key:"shuffle", label:"Shuffle", menu:"stack", fn:"shuffle", obj:"stack", cards:"stack", groups:[ "discard:*", "hand:*", "shared:*"], filters:{ dealer:true, maxCards:0 }, options:{} }
          ]
        });

      //Discard Defaults
      stacks["discard"] = new Stack(_app, {
          key:"discard", label:"Discard", group:"discard", shared:true, layout:"stack", face:"up", initUp:0, initDown:0, cardAction:"select",
          actions:[
            { key:"pickup", label:"Pick Up", menu:"stack", fn:"move", obj:"stack", cards:"selection", groups:[ "hand:owner" ], filters:{ everyone:true, minCards:1 }, options:{} }
          ]
        });

      //Shared Defaults
      stacks["shared"] = new Stack(_app, {
          key:"shared", label:"Shared", group:"shared", shared:true, layout:"space", face:"up", initUp:0, initDown:0, cardAction:"select",
          actions:[
            { key:"draw", label:"Draw", menu:"stack", fn:"draw", obj:"stack", cards:"stack", groups:["deck:*"], filters:{ dealer:true }, options:{} }
          ]
        });

      //Hand(s) Defaults
      for (x = 0; x < players.length; x++) {
        stacks["hand_" + x] = new Stack(_app, {
            key:"hand_" + x, label:"Hand", group:"hand", shared:false, layout:"fan", face:"down", initUp:0, initDown:0, owner:players[x].key, cardAction:"select",
            actions:[
              { key:"draw", label:"Draw", menu:"stack", fn:"draw", obj:"stack", cards:"selection", groups:["deck:*"], filters:{ }, options:{} },
              { key:"discard", label:"Discard", menu:"stack", fn:"move", obj:"stack", cards:"selection", groups:["discard:shared","discard:owner"], filters:{ owner:true, minSel:1 }, options:{} }
            ]
          });
      }

      //resolve arrStackConfigs into unqiue stack configs for all players
      for (x = 0; x < arrStackConfigs.length; x++) {
        group = arrStackConfigs[x]["key"];
        cfg = Object.assign({}, arrStackConfigs[x], { group:group });
        if (cfg["shared"] === true) {
          //if stack is shared, just create one copy
          arrCfg.push(Object.assign({}, cfg, { owner:"" }));
        } else {
          //otherwise, create a stack with a unique key for each player
          for (p = 0; p < players.length; p++) {
            arrCfg.push(Object.assign({}, cfg, { key:group + '_' + p, owner:players[p].key }));
          }
        }
      }

      //now iterate thru stack configs adding or updating each
      for (x = 0; x < arrCfg.length; x++ ) {
        cfg = arrCfg[x];
        if (typeof stacks[cfg.key] == "object") {
          //entry exists so just update it
          for (k in cfg) {
            stacks[cfg.key][k] = cfg[k];
          }
        } else {
          //otherwise create a new stack
          stacks[cfg.key] = new Stack(_app, cfg);
        }
      }

      //if a cards collections was passed then init stack cards using it instead
      this.initCards();

      var cards = _cards;

      //get all the card keys from the cards collection
      availCards = Object.keys(cards);
      //now shuffle the cards
      for (let i = availCards.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i
        [availCards[i], availCards[j]] = [availCards[j], availCards[i]];
      }

      //now initialize cards in each
      for (k in stacks) {
        stack = stacks[k];
        //initial down cards
        var downKeys = availCards.splice(-1 * stack.initDown, stack.initDown);
        var upKeys = availCards.splice(-1 * stack.initUp, stack.initUp);
        downKeys.forEach(function(v){ cards[v].lastUpdate = { stack:stack.key, face:'down', selected:false }; });
        upKeys.forEach(function(v) { cards[v].lastUpdate = { stack:stack.key, face:'up', selected:false }; });
        stacks[k].cardKeys = stacks[k].cardKeys.concat(downKeys, upKeys);
      }

      //now add remining cards to the front of deck stack
      if ((typeof stacks.deck === "object") && (availCards.length > 0)) {
        availCards.forEach(function(v){ cards[v].lastUpdate = { stack:'deck', face:'down', selected:false }; });
        stacks.deck.cardKeys = [].concat(availCards, stacks.deck.cardKeys);
      }

      console.log("initStacks", _stacks);

    },

    enumerable: false
  });

  Object.defineProperty(this,"updateCards",{
    value:function($sel, pCards, sort) {
      var game = this;
      var out = [];
      var cards = pCards.map((v) => game.getCard(v));
      for (var c = 0; c < cards.length; c++) {
        out.push(_app.applyTemplate("card", cards[c]));
      }
      $sel.html(out.join(""));
    },
    enumerable: false
  });

  Object.defineProperty(this,"init",{
    /**
     * Purpose: Initialize using passed gameType, players or game state object.
     *
     * @param {string}  [pConfig] Game configuration key.
     * @param {Array}   [pConfig] Player json array each of the form protoPlayer.
     * @param {Object}  [pConfig] Game state object.
     * @param {Object}  [pOptions] Options to use when initializing players.
     **/
    value:function(pData) {
      console.log("Initialize", pData);
      var pGameType = pData["gameType"];
      var pPlayers = pData["players"];
      var pState = pData["state"];
      var room = (typeof _app.room === "object") ? _app.room : { gameType:pGameType };
      var gameConfig = _app.gameConfigs[pGameType];
      var players = (Array.isArray(pPlayers)) ? pPlayers.slice() : _var.players.slice();

      //silently set ready flag to false to stop UI updates and state synching
      _app.ready = false;
      _var.gameType = pGameType;
      this.initPlayers(pPlayers);
      this.initStacks(gameConfig.stacks);

      if (typeof pState === "object") {
        console.log("APPLYING STATE", pState)
        _app.ready = true;
        this.state = pState;
        console.log("RESULT", this.state);
        _var.ready = true;
        _var.lastUpdate = Date.now();
        this.gamearea();
        this.refreshUI(true);
      } else {
        console.log("EMITTING", { gameType:_var.gameType, players:_var.players, state:this.state });
        _app.io.emit("initGame", { gameType:_var.gameType, players:_var.players, state:this.state });
      }

    },
    enumerable: false
  });

  Object.defineProperty(this,"gamearea",{
    value:function() {

      _app.applyTemplate("gamearea", _app, "#gamearea");

      var gameConfig = this.config;

      $("#game-css").html(this.css);

      //output public stacks
      var stacks = Object.values(_stacks).filter((v) => v.key == v.group)
      stacks.forEach(function(paramStack) {
        var stack = paramStack;
        gameConfig.display.forEach(function(displayItem) {
          //if item is for this stack then append the stack's html to matched selectors
          if (displayItem[1] == stack.key) {
            $(displayItem[0]).append(_app.applyTemplate("stack", stack));
          }
        }) //displayItem
      }) //stack

      //output user stacks
      _var.players.forEach(function(pPlayer, pIndex){
        var userKey = _app.user.key;
        var player = pPlayer;
        var playerKey = pPlayer.key;
        var playerSuffix = "_" + pIndex;
        var stacks = Object.values(_stacks).filter((v) => v.key == v.group + playerSuffix);
        stacks.forEach(function(paramStack) {
          var stack = paramStack;
          gameConfig.display.forEach(function(paramDisplayItem) {
            var arrItem = paramDisplayItem;
            var selector = arrItem[0];
            var matchGroup = arrItem[1];
            var matchType = (arrItem.length > 0) ? arrItem[2] : (stack.group == stack.key) ? "everyone" : "owner";
            //stack should only be output if it ...
            //  1. matches specified group and ...
            //  2. matchType is everyone OR matchType is owner and stack owner is current user
            var matches = (stack.group != matchGroup) ? false : (matchType == "everyone") ? true : (matchType != "owner") ? false : (stack.owner.key == _app.user.key) ? true : false;
            if (matches) {
              $(selector).append(_app.applyTemplate("stack", stack));
            }
          }) //displayItem
        }) //stack
      }) //player

    },
    enumerable: false
  });

  Object.defineProperty(this,"newHand",{
    value:function(pPlayers, pDealerKey, pGameType) {
      var x=0;
      var html = "";
      var optAdd = {};
      //player settiungs that reset on each hand (dealer is handled separately)
      var optReset = { folded:false, active:false, high:false, opener:false };

      var stacks, player, players, dealerKey, gameConfig, desiredPlayers, roomUsers;

      //set ready flag to false to stop synching and rendering changes
      _app.ready = false;

      //update private _var.gameType
      _var.gameType = (typeof pGameType === "string") ? pGameType : _var.gameType;

      gameConfig = this.config;

      dealerKey = (typeof pDealerKey === "string") ? pDealerKey : "";

      players = (Array.isArray(pPlayers)) ? pPlayers : (_var.players.length > 0) ? _var.players.slice() : [];

      //if more players than game maximum remove players
      while (players.length > gameConfig.maxPlayers) {
        player = players.pop();
        //tell player they were removed
      }

      //If we have fewer players than desired, add more from room.users if available
      desiredPlayers = gameConfig.maxPlayers;
      if (players.length < desiredPlayers) {
        //build list of settings besides key and name to include for each user
        optAdd = (gameConfig.betInfo.buyIn > 0) ? { buyIns:1, bank:gameConfig.betInfo.buyIn } : {};
        //get a list of keys and names of all users in room
        roomUsers = (typeof _app.room === "object") ? Object.values(_app.room.users).map((v) => (Object.assign({key:v.key, name:v.name}, optAdd ))) : [];
        //remove users who are already in players array
        roomUsers = roomUsers.filter(function(v){
          var key = v.key;
          var idx = players.findIndex((p) => (p.key === key));
          return (idx == -1);
        });
        while ((roomUsers.length > 0) && (players.length < desiredPlayers)) {
          player = roomUsers.pop();
          players.push(player);
          //tell everyone player has joined the game
        }
      }

      //preserve player information, but make sure required data is included
      players = players.map(function (v) {
        p = Object.assign({}, _app.protoPlayer, (typeof v === "string") ? { key:v } : (typeof v === "object") ? v : {}, optReset );

        //User previous dealer if none specified
        if ((dealerKey === "") && (p.dealer === true)) { dealerKey = p.key; }

        //always get name from room.users
        p.name = ((typeof _app.room === "object") && (typeof _app.room.users[p.key] === "object")) ? _app.room.users[p.key].name : p.key;
        //reset settings for start of a game
        p.dealer = (p.key === dealerKey);

        return p;
      });

      //If dealer not actual found, reset dealerKey to empty string
      if ((dealerKey !== "") && (players.findIndex((v) => (v.key === dealerKey)) != -1)) {
        dealerKey = "";
      }

      //Set first player to dealer if none specified
      if ((dealerKey === "") && (players.length > 0)) {
        players[0].dealer = true;
      }

      //update the private players variable with the new players
      _var.players = players;

      //apply game-specific css
      $("#game-css").html(this.css);

      //reset player's hand level properties
      //rebuilds cards collection and resets all stacks
      this.initStacks();

      //clear playing area
      //_app.applyTemplate("gamearea", _app, "#gamearea");

      /* Set Game Title */
      //$("body").attr("game", this.title)

      //this.gamearea();

      //send game initialization event to all clients
      _app.io.emit("initGame", this.state);

    },
    enumerable: false
  });

  return this;
}

/******** EXPORT **********/
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = Game;
} else {
  window.Game = Game;
}
})();
