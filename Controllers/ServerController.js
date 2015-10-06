"use strict";

var config = require('../Config/config.js'),
    Util = require('../Utils/utilities.js'),
    RiotAPI = require('../API/RiotAPI.js'),
    Promise = require('bluebird'),
    _ = require('underscore'),
    AnalysisController = require('./AnalysisController.js'),
    GameController = require('./GameController.js'),
    DataHandler = require('../Data/DataHandler.js'),
    Server = require('../server.js');

var ServerController = (function() {
    var gameControllers,
        sockets,
        socketGamePairs;
    
    //Holds a list of game controllers, and contain information on which game they represent
    gameControllers = {};

    //Sockets that are connected
    sockets = [];
    
    //Socket GameController pairs
    socketGamePairs = {};

    DataHandler.updateChampionsData();
    
    /**
     * Returns the game controller for the given gameId if it exists
     * @param {Long} gameId
     */
    var findGameController = function(gameId) {
        //Find controller
        if(gameControllers.hasOwnProperty(gameId)) {
            return gameControllers[gameId];
        }
        else {
            return null;
        }
    }
    
    /**
     * Removes and deletes any references to the given GameController
     */
    var removeGameController = function(gc) {
        console.log(delete gameControllers[gc.gameId]);
    }
    
    /**
     * Subscribes the socket to the first available game that is already being watched
     * If no game is eligeble, get a random game from the featured game endpoint
     * @param {Socket} socekt
     * @param {String} region
     */
    var handRandomGame = function(socket, region) {
        //Remove previously subscribed game
        if(socketGamePairs[socket]) {
            socketGamePairs[socket].removeSubscriber(socket);
        }
        
        //Find the first GameController listed
        for(var gameId in gameControllers) {
            if(gameControllers.hasOwnProperty(gameId) && typeof gameControllers[gameId] !== 'undefined') {
                //Add as subscriber to game
                gameControllers[gameId].addSubscriber(socket);

                //Store the connection between the socket and the GameController
                socketGamePairs[socket] = gameControllers[gameId];
                
                //End as we found a game that can be used
                return;
            }
        }
        
        //If we did not find a suitable game in the game list, find one from the featured games
        RiotAPI.getFeaturedGames(region).then(function(featuredGames) {
            //Randomize
            var num = featuredGames['gameList'].length;
            var rand = Math.floor(Math.random() * num);
            
            //The featured game endpoint does not contain all the data we need, so we fetch new data from the current game endpoint
            var summonerName = Util.normalizeName(featuredGames['gameList'][rand]['participants'][0]['summonerName']);
            requestGameInformation(socket, summonerName, region);
        });
    }
    
    /**
     * Adds a socket to the GameController representing the game that the socket requested
     * @param {Socket} socket
     * @param {String} searchedName
     * @param {String} region
     */
    var requestGameInformation = function(socket, searchedName, region) {
        //Remove previous subscription
        if(socketGamePairs.socket) {
            socketGamePairs.socket.removeSubscriber(socket);
            socketGamePairs.socket = undefined;
        }
        var errorObject;

        //Find the summonerId from the name
        RiotAPI.getSummonerByName(region, searchedName).catch(function(error) {
            console.log(error.stack);
            console.log(error);
            //Could not find a player with this name
            errorObject = {
                type: "Summoner name",
                error: "No summoner by that name"
            }
            return Promise.reject(errorObject);

        }).then(function(summonerData) {
            //Find the game and id
            return RiotAPI.getCurrentGame(region, summonerData[searchedName]['id']);

        }).catch(function(error) {
            console.log(error.stack);
            console.log(error);
            if(!errorObject) {
                //Player is not in a game
                errorObject = {
                    type: "No game",
                    error: "Summoner is not currently in a game"
                }
                return Promise.reject(errorObject);
            }
            return Promise.reject(errorObject);

        //Handle the subscriptions to the game
        }).then(function(gameData) {
            //Remove previously subscribed game
            if(socketGamePairs[socket]) {
                socketGamePairs[socket].removeSubscriber(socket);
            }
            
            //Find or create the game object
            var gc = findGameController(gameData['gameId']);

            //Create new GameController if it does not exist
            if(!gc) {
                gameControllers[gameData['gameId']] = new GameController(gameData, region);
                
                //Set the time for deletion
                setTimeout(function() { removeGameController(gameControllers[gameData['gameId']]); }, 3600000); //1 hour
            }

            //Add the socket as a listener
            gameControllers[gameData['gameId']].addSubscriber(socket);
            
            //Store the connection between the socket and the GameController
            socketGamePairs[socket] = gc;

        }).catch(function(error) {
            console.log(error.stack);
            //Emit the error message
            Server.emitData(socket, "error", error);
        });
    }
    
    return {
        requestGameInformation: requestGameInformation,
        requestRandomGame: handRandomGame
    }
}());

module.exports = ServerController;