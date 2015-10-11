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
            var rand = Math.floor(Math.random() * (num - 1)); //-1 to account for the index starting at 0
            console.log(num + " - " + rand);
            //The featured game endpoint does not contain all the data we need, so we fetch new data from the current game endpoint
            var summonerName = Util.normalizeName(featuredGames['gameList'][rand]['participants'][0]['summonerName']);
            requestGameInformation(socket, summonerName, region, true);
        });
    }
    
    /**
     * Adds a socket to the GameController representing the game that the socket requested
     * @param {Socket} socket
     * @param {String} searchedName
     * @param {String} region
     * @param {Boolean} randomGameFlag Whether or not this game is requested as a random game
     */
    var requestGameInformation = function(socket, searchedName, region, randomGameFlag) {
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
                error: "No summoner by that name",
                    crucial: true
            }
            return Promise.reject(errorObject);

        }).then(function(summonerData) {
            //Find the game and id
            return RiotAPI.getCurrentGame(region, summonerData[searchedName]['id']);

        }).catch(function(error) {
            /* The searched for player is currently not in a game
             * Send an error message back to the client with this information */
            
            /* Log error */
            console.log(error.stack);
            console.log(error);
            if(!errorObject) {
                errorObject = {
                    type: "No game",
                    error: "Summoner is not currently in a game",
                    crucial: true
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
            /* If the game was assigned as a randomg game,
             * not finding the game means it is finished
             * therefore we assign a new random game to the socket */
            if(randomGameFlag) {
                console.log("Random game was ended, assigning new game...");
                handRandomGame(socket, region);
            }
            /* Send the error to the client */
            else {
                console.log(error.stack);
                //Emit the error message
                socket.emit("message", {"error": error} );
            }
        });
    }
    
    return {
        requestGameInformation: requestGameInformation,
        requestRandomGame: handRandomGame
    }
}());

module.exports = ServerController;