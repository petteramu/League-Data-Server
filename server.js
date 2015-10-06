"use strict";

var app = require('express')();
var httpserver = require('http').Server(app);
var io = require('socket.io')(httpserver);
var ServerController = require('./Controllers/ServerController.js');

var server = (function() {

    var instance = this,
        server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080,
        server_ip   = process.env.OPENSHIFT_NODEJS_IP   || '127.0.0.1';
    io.set('origins', '*:*');
    
    //Start listening
    httpserver.listen(server_port, server_ip, function() {
        console.log("Server online at: " + server_ip + ":" + server_port);
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