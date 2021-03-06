/*** Client-side code ****/
$(function () {
  var socket = io();

  /****** INIT IO EVENTS ******/
  socket.on('connect', function(){
    console.log("** socket.connect", this.io.engine.id, this);
    var appKey = this.io.engine.id;
    if (typeof window._app !== "object") {
      window._timer = 0;
      window._app = new Application(appKey, this);
      _app.init();
      _app.timer = true;
    } else {
      window._app.key = appKey;
    }
  }); // end sock.on connect

  $('body').on('touchstart', '*[stack] .card-item[card]', function(){ $(this).addClass('pressed') })
  $('body').on('touchend', '*[stack] .card-item[card]', function(){ $(".pressed").removeClass('pressed') })

  //*** Card Click Events If Card does NOT have a dropdown menu ****/
  $('body').on('click', '*[stack] .card-item[card] .card-btn:not([data-toggle="dropdown"])', function(){
    var $card = $(this).closest('.card-item[card]');
    var cardId = $card.attr("card");
    var stackId = $card.closest("[stack]").attr("stack");
    var card = _app.game.getCard(cardId);
    var stack = _app.game.getStack(stackId);
    var cardAction = (stack && stack.cardAction) ? stack.cardAction : "select";
    console.log("Card Action", cardAction, card, stack);
    switch (stack["cardAction"]) {
      case "none":
        card.selected = false;
        break;
      case "menu":
        //all code is in the event that shows the menu
        break;
      case "flip":
        //flip the card
        card.face = (card.face=='up') ? 'down' : 'up';
        break;
      case "select":
        card.selected = !card.selected;
        break;
      case "first":
        card.selected = !card.selected;
        if (card.selected) {
          stack.groupBy("selection");
        } else {
          stack.cards.forEach((v)=>{ _app.game.getCard(v).selected = false; })
        }
        stack.refreshUI(true);
        break;
      default:
        //todo: check actions collection on stack for a match
        if (typeof stack.stackMenu == "object") {
          if (stack.stackMenu[stack["cardAction"]]) {
          }
        }
    }
    card.refreshUI(true);
  });

  //*** Main Actions Processor for Game Events ****/
  $('body').on('click', '[data-action]', function(event){
    var $btn = $(this);
    var actionId = $btn.attr("data-action");
    var $el = $(this);
    var target = $el.attr("data-target") || "";
    var $target = (target != "") ? $(target) : $el;
    var args = $el.attr("data-args") || "";
    var options, attrs, attr, attrSrc, attrDest, attrVal;
    switch (actionId) {

      case "select":
        attrs = args.split("|");
        attrs.forEach(function (v) {
          attr = v.split(":");
          attrSrc = attr[0];
          attrDest = (attr.length > 1) ? attr[1] : attrSrc;
          attrVal = "";
          switch (attrSrc) {
            case "val": attrVal = $el.val(); break;
            case "html": attrVal = $el.html(); break;
            case "text": attrVal = $el.text(); break;
            default: attrVal = $el.attr(attrSrc); break;
          }
          switch (attrDest) {
            case "val": $(target).val(attrVal); break;
            case "html": $(target).html(attrVal); break;
            case "text": $(target).text(attrVal); break;
            default: attrVal = $(target).attr(attrDest, attrVal); break;
          }
        });
        break;

      case "createRoom":
        console.log("createRoom", _app.isHost, _app.room)
        var users = {};
        users[_app.user.key] = _app.user.state;
        options = { hostKey:_app.user.key, users:users, title:_app.user.name + "'s Game Room" };
        $.each(this.attributes,function(i,a){
        	if (a.name.indexOf("room-") === 0) {
            options[a.name] = (a.value.indexOf("#") === 0) ? $(a.value).val() : a.value;
          }
        });
        if (typeof _app.room === "object") {
          _app.io.emit("leaveRoom");
        }
        _app.room = new Room(_app, options);
        _app.io.emit("createRoom", _app.room.state);
        $("#dlgGames").modal("show");
        break;

      case "leaveRoom":
        _app.io.emit("leaveRoom");
        break;

      case "joinRoom":
        attrVal = $("#joinGameCode").val().toUpperCase();
        _app.io.emit("joinRoom", attrVal);
        break;

      case "setGameType":
        attrVal = $el.attr("game-type");
        if (_app.isHost) {
          _app.room.gameType = attrVal;
          _app.game = new Game(_app, attrVal);
          $("#dlgGameStart").modal("show");
        } else {
          _app.io.emit("quickPlay", { gameType:attrVal })
        };
        break;

      case "startGame":
        if (_app.isHost) {
          options = {}
          //get the specified players
          var players = [];
          //get the dealer key
          var dealerKey = $("#dlgGameStart [dealer-key]").attr("dealer-key") || options["dealerKey"] || "";

          $("#dlgGameStart [data-toggle='dropdown'][player-key][player-name]:not([player-key=''])").each(function(index){
            var $el = $(this);
            var playerKey = $el.attr("player-key");
            var playerName = $el.attr("player-name");
            var obj = Object.assign({}, _app.protoPlayer, { key:playerKey, name:playerName });
            players.push(obj);
            console.log('Adding player', obj);
          });

          //get settings from dialog attributes
          $.each(document.getElementById("dlgGameStart").attributes,function(i,a){
            if (a.name.indexOf("game-") === 0) {
              options[a.name.replace("game-","")] = (a.value.indexOf("#") === 0) ? $(a.value).val() : a.value;
            }
          });
          /*
          //read settings from dlgGameStart
          $("#dlgGameStart [prop-name][prop-val]").each(function(index){
            attr = $(this.attr("prop-name"));
            attrVal = $(this).attr("prop-val");
            options[$(this).attr("prop-name")] =  (attrVal.indexOf("#") === 0) ? $(attrVal).val() : attrVal;
          })
          */
          _app.game.init({ gameType:_app.room.gameType, players:players});
        }
        break;

      case "setCardSize":
        $("body").removeClass("card-sm card-md card-lg").addClass(args);
        break;

      case "sendMessage":
        var icon = $el.attr("msg-icon") || $el.attr("emoji") || "";
        var text = $target.attr("msg-text") || $target.val() || $target.text() || $el.attr("msg-text") || "";
        var title = $el.attr("msg-title") || _app.user.name || "";
        var css = $el.attr("msg-css") || "";
        var msg = { title:title, text:text, icon:icon, css:css }
        $($el.attr("data-target")).val("");
        _app.sendMessage(msg);
        break;

      case "setTrump":
        $("[propname='trump']").attr("propval", target);
        break;
    }
  });

  //*** Stack Actions ****/
  $('body').on('click', '[stack-action]:not([stack-action=""])', function(event){
    var $el = $(this);
    var actionKey = $el.attr("stack-action");
    var $card = $el.closest(".card-item[card]");
    var stackKey = $el.closest("[stack]").attr("stack");
    var stack = _app.game.stacks[stackKey];
    var card = ($card.length) ? _app.game.getCard($card.attr("card")) : undefined;
    var actions = (!!card) ? stack.cardActions : stack.actions;
    var action;
    if (!!stack && !!actions) {
      actions = actions.filter(function (v) { return (v.key === actionKey); });
      if (actions.length) {
        console.log("executing", actions[0]);
        var action = new Action(_app, (!!card) ? card : stack, actions[0]);
        action.execute();
      }
    } else {
      console.log("ERROR no [stack] found", $el, stack);
    }
  });


  /*** Modal Dialogs optional template support *****/
  $('body').on('show.bs.modal', '.modal', function(event){
    //store the button that launched the dialog so we can refer to it later
    //to retrieve additional settings such as game-mode on the dlgGames dialog
    $(this).data("relatedTarget", event.relatedTarget);
    //if a template source exists or a precompiled template exists, apply to dialog before displaying
    if (document.getElementById(event.target.id + "-template") || (_app.templates[event.target.id] === "function")) {
      _app.applyTemplate(event.target.id, _app, $(event.target));
    }
  });

  /*** Stack Dropdown Menus are Dynamically-loaded *****/
  $('body').on('show.bs.dropdown', '.stack-menu', function(event){
    var $button = $(event.relatedTarget) // Button that triggered the dropdown
    var $card = $button.closest(".card-item[card]");
    if ($card.length === 0) {
      var $stack = $button.closest(".stack[stack]");
      var $menu = $(this).find(".dropdown-menu");
      var stack = _app.game.getStack($stack.attr("stack"));
      var html = stack.stackMenu;
      $menu.html(html);
    }
  })

  //*** Dropdown Submenu Extension ****/
  $('body').on('click', '.dropdown-submenu > button:first-child', function(event){
    //preserve new intended state of related submenu
    var bNewState = !$(this).next('ul').hasClass('show');
    //*** close all sibling and descendant submenus ****/
    $(this).closest('.dropdown-submenu').closest('.dropdown-menu').find('.dropdown-submenu > .dropdown-menu.show').removeClass('show');
    /*** toggle this one ****/
    $(this).next('ul').toggleClass('show', bNewState);
    event.stopPropagation();
    event.preventDefault();
  });
  $('body').on('hide.bs.dropdown', '.dropdown', function(event){
    /* hide all submenus of dropdown when dropdoiwn is closed */
    $(this).find('.dropdown-submenu > .dropdown-menu.show').removeClass('show');
  })


  $('body').on('hidden.bs.toast', '.toast', function(event){
    var elem = this;
    elem.parentNode.removeChild(elem);
  });


  $('body').on('hide.bs.dropdown', '.card-menu', function(event){
    var cardKey = $(this).closest("[card]").attr("card");
    var card = _app.game.getCard(cardKey);
    card.selected = false;
    card.refreshUI(true);
  });

  $('body').on('show.bs.dropdown', '.card-menu', function(event){
    var $button = $(event.relatedTarget) // Button that triggered the dropdown
    var $menu = $(this).find(".dropdown-menu");
    var stackKey = $button.closest(".stack[stack]").attr("stack");
    var cardKey = $button.closest("[card]").attr("card");
    var stack = _app.game.getStack(stackKey);
    //toggle this card to selected and other cards to not selected
    stack.cards.forEach(function (v) {
      var card = _app.game.getCard(v);
      card.selected = (card.key == cardKey);
    });
    //refreshes stack html if stack has changed or just card face and selection for changed cards
    stack.refreshUI();
    $menu.html(stack.cardMenu);
  })

  $('body').on('show.bs.dropdown', '.dropdown:has(*[data-template])', function(event){
    var $button = $(event.relatedTarget) // Button that triggered the dropdown
    var $menu = $(this).find("[data-template]");
    var tplName = $menu.attr("data-template");
    console.log("Loading template " + tplName);
    _app.applyTemplate(tplName, _app, $menu);
  })

  $('body').on('show.bs.dropdown', '*[data-listtype]', function(event){
    /***
      <button type="button" class="{{css}}{{item.css}}" styles="{{styles}}{{item.styles}}" {{attr}} {{item.attr}}>{{{html}}}|{{text}}|{{label}}</button>
    ***/
    var $el = $(this);
    var $button = $(event.relatedTarget) // Button that triggered the dropdown
    var $menu = $(this).find("*.dropdown-menu");
    var target = $button.attr("id");
    target = (!!target) ? "#" + target : "";
    var listType = $el.attr("data-listtype");
    var items = [];
    var baseAttrs = { "data-action":"select", "data-target":target };
    console.log("Loading list of " + listType);
    switch (listType) {
      case "users":
        baseAttrs["data-args"] = "html|player-key|player-name";
        items = Object.values(_app.room.users).map((v) => {
          return { attr:{ "player-key":v.key, "player-name":v.name }, label:v.name }
        });
        //add an unselector item
        items.push({ attr:{ "data-placeholder":"no selection", "player-key":"", "player-name":"" }, label:"" })
        break;
    }
    _app.applyTemplate("itemlist", { css:"dropdown-item", attr:baseAttrs, items:items }, $menu);
  })
});
