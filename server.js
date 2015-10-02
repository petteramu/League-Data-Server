"use strict";

var app = require('express')();
var httpserver = require('http').Server(app);
var io = require('socket.io')(httpserver);
var ServerController = require('./Controllers/ServerController.js');

var server = function() {

    var instance = this,
        server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080,
        server_ip   = process.env.OPENSHIFT_NODEJS_IP   || '127.0.0.1',
        serverController = new ServerController(this);
    io.set('origins', '*:*');
    
    //Start listening
    httpserver.listen(server_port, server_ip, function() {
        console.log("Server online at: " + server_ip + ":" + server_port);
    });
    
    io.sockets.on('connection', function (socket) {
        console.log( "- Connection established: " + socket.request );
        addListeners(socket);
    });
    
    //Adds listeners
    function addListeners(socket) {
        socket.on('get:currentgame', function(data) {
            console.log( "- Request received for current game data: " + socket.request );
            
            //Normalize name
            var name = data.name.toLowerCase().replace(" ", ""),
                region = data.region || 'euw'
            
            serverController.requestGameInformation(socket, name, region);
        });
                
        //Log disconnects
        socket.on('disconnect', function() {
            console.log('Got disconnect!');
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