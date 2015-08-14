"use strict";

var app = require('express')();
var httpserver = require('http').Server(app);
var io = require('socket.io')(httpserver);
var RiotAPI = require('./API/api.js');
var Database = require('./db.js');
var serverController = require('./serverController.js');

var server = function() {
    
    io.set('origins', '*:*');
    
    var connections = [];
    
    //Initialize api connection
    var api = new RiotAPI({
        secure: true,
        debug: false
    });

    httpserver.listen(1337);

    var instance = this;
    var host = httpserver.address().address;
    var port = httpserver.address().port;
    console.log("Server online at: "+host+":"+port);
    
    io.sockets.on('connection', function (socket) {
        console.log( "- Connection established: " + socket.request );
        addListeners(socket);
    });
    
    //Adds listeners
    function addListeners(socket) {
        socket.on('get:currentgame', function(data) {
            console.log( "- Request received for current game data: " + socket.request );
            var controller = new serverController(instance, socket, api);
            controller.createCurrentGameData(data);
        });
    }
    
    //Public functions
    this.emitData = function(err, socket, type, data) {
        console.log("sending data: " + type);
        if(err) {
            socket.emit('message', err);
            return;
        }
        var result = {};
        result[type] = data;
        socket.emit('message', result);
    }
    
    return this;
}

var s = new server();