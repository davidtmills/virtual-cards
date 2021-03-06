const express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var Application = require('./public/obj/application');
var Card = require('./public/obj/card');
var Game = require('./public/obj/game');
var Player = require('./public/obj/player');
var Room = require('./public/obj/room');
var Stack = require('./public/obj/stack');
var User = require('./public/obj/user');
var Action = require('./public/obj/action');

var _app = new Application("SERVER", io);

Object.defineProperty(_app,"userlist",{
  value: function(roomKey) {
    var roster = _app.io.sockets.clients(roomKey);
    var list = [];
    roster.forEach(function(client) {
      list.push(client.__userKey);
    });
    return "\nUsers: " + list.join(",");
  }
})

Object.defineProperty(_app,"roomlist",{
  value: function(socket) {
    var list = Object.keys(socket.rooms);
    return "\nRooms: " + list.join(",");
  }
})

/**** Server-side extensions *****/
_app.rooms = {};
_app.users = {};
_app.waitlist = {};

//set up waitlist with entry for each game type
for (var k in _app.gameConfigs) {
  _app.waitlist[k] = { games:[], users:[] }
}

_app.endUserSession = function(socket) {
  var user = _app.getUser(socket.__userKey);
  var room = _app.getRoom(socket.__roomKey);
  if ((typeof room === "object") && (typeof user === "object")) {
    room.removeUser(user);
  }
  delete _app.users[socket.__userKey];
}

_app.startUserSession = function(socket, pUserData) {
  var userKey = (typeof socket.__userKey === "string") ? socket.__userKey : "";
  var roomKey = (typeof socket.__roomKey === "string") ? socket.__roomKey : "";
  var user = _app.users[userKey];
  var room = _app.rooms[roomKey];
  var userData = Object.assign({}, pUserData);
  if (typeof userData.key !== "string") {
    console.log("ERROR startSession bad param:", userData);
  } else if ((typeof user === "object") && (userData["key"] != user.key)) {
    console.log("ERROR startSession wrong user", userData);
  } else if (typeof user === "object") {
    user = _app.updateProperty(user, userData);
  } else {
    user = new User(_app, userData);
  }
  if (typeof user === "object") {
    //store cross reference of user key and room key on the socket object
    socket.__userKey = user.key;
    socket.__roomKey = roomKey;
    //add socket to user object
    Object.assign(user, { socket:socket });
    //add/update user to users collection
    _app.users[user.key] = user;
    if (typeof room === "object") {
      room.addUser(user);
    }
  }
  return user;
}

/****** Socket Event Handlers *******/
io.on('connection', socket => {
  console.log('Connect', socket.id);

  if (typeof socket.__userKey !== "string") {
    socket.__userKey = "";
  }

  if (typeof socket.__roomKey !== "string") {
    socket.__roomKey = "";
  }

  socket.on('reconnect', function(){
    console.log('io.reconnect', this.id);
  });

  socket.on('reconnect_failed', function(){
    console.log('io.reconnect_failed', this.id);
    endUserSession(this);
  });

  socket.on('disconnect', function(pClose){
    console.log('io.disconnect', this.id, pClose);
    if (pClose === true) {
      endUserSession(this);
    }
  });

  // Custom Events

  socket.on('state', function(pClass, pKey, pData){
    console.log(this.__userKey, this.__roomKey, 'io.state', pClass, pKey);
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(this.__roomKey);
    var socket = (typeof room === "object") ? io.to(room.key) : this;
    var obj = _app.getObject(pClass, pKey, this.__userKey, this.__roomKey);
    //update state of local object if one exists
    if (typeof obj === "object") {
      obj.state = pData;
    }
    //broadcast to all subscribers of the room
    socket.emit("state", pClass, pKey, pData);
  });

//*** ROOM Events ****/
  socket.on('createRoom', function(pConfig){
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(this.__roomKey);
    var users = (typeof pConfig.users !== "object") ? [] : (!Array.isArray(pConfig.users)) ? Object.keys(pConfig.users) : pConfig.users.map((v) => (typeof v === "object") ? v.key : v);;

    if (typeof user === "object") {
      //remove from previous room if in one
      if (room === "object") {
        room.removeUser(user.key);
      }

      //create the room with user as host
      var roomData = Object.assign({ title:user.name + "'s Room" }, pConfig, { hostKey:user.key, users:{} });
      room = new Room(_app, roomData);
      _app.rooms[room.key] = room;

      //Anounce creation
      _app.sendMessage({ title:"io.createRoom (index)", text: "Room created.\n" + room.title });

      //add the users
      users.forEach(function (v) {
        room.addUser(v);
      });

      //make sure creator/host is in room
      if (typeof room.users[user.key] !== "object") {
        room.addUser(user.key);
      }

      console.log(this.__userKey, this.__roomKey, "room created", room.key, room.accessCode, room.title);
      console.log(this.rooms);
    }
  });

  socket.on('destroyRoom', function(pRoomKey){
    var roomKey = (typeof pRoomKey === "string") ? pRoomKey : this.__roomKey;
    var room = _app.getRoom(roomKey);
    var user = _app.getUser(this.__userKey);
    //todo: add check to make sure acting user is the host of the room or users is empty
    if ((typeof room === "object") && (typeof user === "object") && (room.hostKey === user.key)) {
      room.destroy();
    }
  });

  socket.on('joinRoom', function(pAccessCode, pUserKey){
    var userKey = (typeof pUserKey === "string") ? pUserKey : this.__userKey;
    var accessCode = (typeof pAccessCode === "string") ? pAccessCode : "";
    var user = _app.getUser(userKey);
    var room = _app.getRoom({ accessCode:accessCode });
    console.log(userKey, accessCode, room)
    if ((typeof user === "object") && (typeof room === "object")) {
      room.addUser(userKey);
      console.log(userKey + ' joined ' + room.key + ' with code ' + accessCode);
    } else if (typeof room === "undefined") {
      this.emit("showDialog", "#dlgJoinGame")
      _app.sendMessage({ title:"io.joinRoom (index)", text:"Expired or invalid Game Code" }, this);
    } else {
      _app.sendMessage({ title:"io.joinRoom (index)", text:"You are not logged in." }, this);
    }
  });

  socket.on('leaveRoom', function(pRoomKey, pUserKey){
    var roomKey = (typeof pRoomKey === "string") ? pRoomKey : this.__roomKey;
    var room = _app.getRoom(roomKey);
    //host may boot anyone but other users can only remove themselves
    var userKey = ((typeof pUserKey === "string") && (typeof room === "object") && (room.hostKey === this.__userKey)) ? pUserKey : this.__userKey;
    var user = _app.getUser(userKey);
    if ((typeof user === "object") && (typeof room === "object")) {
      room.removeUser(user);
    }
  });

  socket.on('blockUser', function(pUserKey, pRoomKey){
    var blockKey = pUserKey;
    var roomKey = (typeof pRoomKey === "string") ? pRoomKey : this.__roomKey;
    var room = _app.getRoom(roomKey);
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(roomKey);
    if ((typeof user === "object") && (typeof room === "object") && (user.key === room.hostKey)) {
      room.blockUser(blockKey);
    }
  });

  socket.on('unblockUser', function(pUserKey, pRoomKey){
    var unblockKey = pUserKey;
    var roomKey = (typeof pRoomKey === "string") ? pRoomKey : this.__roomKey;
    var room = _app.getRoom(roomKey);
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(roomKey);
    if ((typeof user === "object") && (typeof room === "object") && (user.key === room.hostKey)) {
      room.unblockUser(unblockKey);
    }
  });

  socket.on('chatMessage', function(pMessage){
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(this.__roomKey);
    if ((typeof user === "object") && (typeof room === "object")) {
      _app.sendMessage(pMessage, room.key);
    } else if (typeof user === "object") {
      _app.sendMessage(Object.assign(pMessage, { title:"io.chatMessage (index)", text:"Missing Room" }), this);
    }
  });


//******** GAME Events ************/
  socket.on('initGame', function(pData){
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(this.__roomKey);
    if (user && room) {
      console.log("Broadcasting Initialize Game Event ...");
      _app.io.to(room.key).emit("initGame", pData);
    }
  });

  socket.on('quickPlay', function(pGameType){
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(this.__roomKey);
    var gameType = (typeof pGameType === "string") ? pGameType : (room && typeof room.gameType === "string") ? room.gameType : "";
    if (user && _app.waitlist[gameType]) {
      for (var k in _app.waitlist) {
        _app.waitlist[k].users.forEach((v) => { if (v === user.key) { v = "" } });
      }
       _app.waitlist[gameType].users.push(user.key);
    }
  });

  socket.on('cancelQuickPlay', function(){
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(this.__roomKey);
    if (user) {
      for (var k in _app.waitlist) {
        _app.waitlist[k].users.forEach((v) => { if (v === user.key) { v = "" } });
      }
    }
  });

  socket.on('inviteGuests', function(pNumGuests){
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(this.__roomKey);
    if ((typeof user === "object") && (typeof room === "object") && (user.key === room.hostKey) && (typeof _app.waitlist[room.gameType] === "object")) {
      //change any existing request for this game to empty strings
      //the processor will remove, we don't want to have a race condition
      for (var k in _app.waitlist) {
        _app.waitlist[k].games.forEach((v) => { if (v === room.key) { v = "" } });
      }
      //add an entry for each requested seat
      for (var x = 0; x < pNumGuests; x++) {
        _app.waitlist[room.gameType].games.push(room.key);
      }
    }
  });

  socket.on('cancelInviteGuests', function(){
    var user = _app.getUser(this.__userKey);
    var room = _app.getRoom(this.__roomKey);
    if ((typeof user === "object") && (typeof room === "object") && (user.key === room.hostKey)) {
      //change any existing request for this game to empty strings
      //the processor will remove, we don't want to have a race condition
      for (var k in _app.waitlist) {
        _app.waitlist[k].games.forEach((v) => { if (v === room.key) { v = "" } });
      }
    }
  });


  //*** USER Events ****/
  socket.on('initUser', function(pUserData){
    console.log('io.initUser', this.id, pUserData["key"], pUserData["name"]);
    _app.startUserSession(this, pUserData);
  });

  socket.on('login', function(pUserData){
    console.log('io.login', this.id, pUserData["key"]);
    _app.startUserSession(this, pUserData);
  });

  socket.on('logout', function(pOptions){
    console.log('io.logout', this.id, pOptions);
    endUserSession(this);
  });

  socket.on('updateProfile', function(pProfileData){
    var user = _app.users[this.__userKey];
    console.log('io.updateProfile', this.id, pProfileData["key"], this.__userKey);
  });


});

/**** Web Server Setup ****/
app.get('/', function(req, res){
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/index.html', function(req, res){
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/favicon.ico', function(req, res){
  res.sendFile(__dirname + '/public/icon.png');
});

app.get('/manifest.webmanifest', function(req, res){
  res.sendFile(__dirname + '/public/manifest.webmanifest');
});

app.use('/css', express.static(__dirname + '/public/css'));
app.use('/obj', express.static(__dirname + '/public/obj'));
app.use('/img', express.static(__dirname + '/public/img'));
app.use('/js', express.static(__dirname + '/public/js'));

app.get('/*', function (req, res, next) {
  //var reqUrl = new URL(req.protocol + '://' + req.host  + ':8081' + req.url);
  next();
});

function processWaitlist(){
  //Cycles waiting games for each game type adding available users
  for (var k in _app.waitlist) {
    var gameType = k;
    var gameConfig = _app.gameConfigs[k];
    var unhandled = [];
    var wlist = _app.waitlist[k];
    while ((_app.waitlist[k].games.length > 0) && (_app.waitlist[k].users.length > 0)) {
      var gameKey = wlist.games.shift();
      var room = _app.rooms[gameKey];
      if (typeof room === "object") {
        var playerKey = wlist.users.shift();
        while ((playerKey == "") && (wlist.users.length > 0)) {
          playerKey = wlist.users.shift();
        }
        var user = _app.users[playerKey];
        if (typeof user !== "object") {
          //if not a valid user then put game back in queue
          unhandled.push(gameKey);
        } else {
          room.addUser(user.key);
        }
      }
    }
    //add unhandled games back to start in same order
    while (unhandled.length > 0) {
      wlist.games.unshift(unhandled.pop());
    }
    //now get next remaining player if one exists
    if (wlist.users.length > 0) {
      var playerKey = wlist.users.shift();
      while ((playerKey == "") && (wlist.users.length > 0)) {
        playerKey = wlist.users.shift();
      }
      var user = _app.users[playerKey];
      //if player found, create a new room, add the user and request new users
      if (typeof user === "object") {
        var room = new Room({ hostKey:user.key, gameType:k, isOpen:true, isPrivate:false })
        room.addUser(user.key);
      }
    }
  }
}

setInterval(processWaitlist, 2000);


http.listen(port, function(){
  console.log('listening on *:' + port);
});
