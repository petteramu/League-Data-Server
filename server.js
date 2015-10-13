"use strict";

var app = require('express')(),
    httpserver = require('http').Server(app),
    io = require('socket.io')(httpserver),
    ServerController = require('./Controllers/ServerController.js'),
    ServerConfig = require('./ServerConfig.js');

var server = (function() {

    var instance = this;
    
    //Allow connections from outside domains
    io.set('origins', '*:*');
    
    //Start listening
    httpserver.listen(ServerConfig.port, function() {
        console.log("Server listening on: " + ServerConfig.port);
    });
    
    io.sockets.on('connection', function (socket) {
        console.log( "- Connection established: " + socket );
        addListeners(socket);
    });
    
    //Adds listeners
    var addListeners = function(socket) {
        socket.on('get:currentgame', function(data) {
            console.log( "- Request received for current game data: " + socket );
            
            //Normalize name
            var name = data.name.toLowerCase().replace(" ", ""),
                region = data.region || 'euw'
            
            ServerController.requestGameInformation(socket, name, region);
        });
        
        
        socket.on('get:randomgame', function(data) {
            console.log( "- Request received for random game data: " + socket );
            
            //Normalize name
            var region = data.region || 'euw';
            ServerController.requestRandomGame(socket, region);
        });
                
        //Log disconnects
        socket.on('disconnect', function() {
            console.log('Got disconnect!');
        });
    }
}());

module.exports = server;