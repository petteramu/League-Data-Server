"use strict";

var app = require('express')();
var httpserver = require('http').Server(app);
var io = require('socket.io')(httpserver);
var RiotAPI = require('./API/api.js');
var Database = require('./db.js');
var serverController = require('./serverController.js');

var server = function() {
    
    var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
    var server_ip   = process.env.OPENSHIFT_NODEJS_IP   || '127.0.0.1';
    io.set('origins', '*:*');
    
    var connections = [];
    
    //Initialize api connection
    var api = new RiotAPI({
        secure: true,
        debug: false
    });

    httpserver.listen(server_port, server_ip, function() {
        console.log("Server online at: " + server_ip + ":" + server_port);
    });

    var instance = this;
    
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
        
        socket.on('get:randomgame', function(data) {
            console.log( "- Request received for random game data: " + socket.request );
            var controller = new serverController(instance, socket, api);
            controller.getRandomFeaturedGame(data);
        });
    }
    
    //Public functions
    this.emitData = function(socket, type, data) {
        console.log("sending data: " + type);

        var result = {};
        result[type] = data;
        socket.emit('message', result);
    }
    
    return this;
}

var s = new server();