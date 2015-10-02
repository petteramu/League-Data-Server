var config = require('../Config/config.js'),
    Util = require('../Utils/utilities.js'),
    RiotAPI = require('../API/RiotAPI.js'),
    Promise = require('bluebird'),
    _ = require('underscore'),
    AnalysisController = require('./AnalysisController.js'),
    GameController = require('./GameController.js'),
    DataHandler = require('../Data/DataHandler.js');

var ServerController = function(server) {
    var gameControllers,
        sockets,
        socketGamePairs,
        api,
        analysisController,
        dh,
        server = server,
        _public = {};
    
    //Holds a list of game controllers, and contain information on which game they represent
    gameControllers = {};

    //Sockets that are connected
    sockets = [];
    
    //Socket GameController pairs
    socketGamePairs = {};

    //Initialize an api connection
    api = new RiotAPI({
        secure: true,
        debug: false
    });
    //Keep alive on the server
    //Should be unnecessary when the analysis controller is done
    setInterval(function() { console.log("Keep alive"); }, 600000);

    //Create analysis controller
    analysisController = new AnalysisController();

    //Create a DataHandler
    dh = new DataHandler(api, analysisController);

    dh.updateChampionsData();
    
    function findGameController(gameId) {
        //Find controller
        if(gameControllers.hasOwnProperty(gameId)) {
            return gameControllers[gameId];
        }
        else {
            return null;
        }
    }
    
    /**
     * Adds a socket to the GameController representing the game that the socket requested
     **/
    _public.requestGameInformation = function(socket, searchedName, region) {
        //Remove previous subscription
        if(socketGamePairs.socket) {
            socketGamePairs.socket.removeSubscriber(socket);
            socketGamePairs.socket = undefined;
        }
        var errorObject;

        //Find the summonerId from the name
        api.getSummonerByName(region, searchedName).catch(function(error) {
            console.log(error.stack);
            console.log(error);
            //Could not find a player with this name
            errorObject = {
                type: "Summoner name",
                error: "No summoner by that name"
            }
            return errorObject;

        }).then(function(summonerData) {
            //Find the game and id
            return api.getCurrentGame(region, summonerData[searchedName]['id']);

        }).catch(function(error) {
            console.log(error.stack);
            console.log(error);
            if(!errorObject) {
                //Player is not in a game
                errorObject = {
                    type: "No game",
                    error: "Summoner is not currently in a game"
                }
                return errorObject;
            }
            return errorObject;

        }).then(function(gameData) {
            //Find or create the game object
            var gc = findGameController(gameData['gameId']);

            //Create if it does not exist
            if(!gc) {
                gc = new GameController(gameData, region, _public, dh, analysisController);
                gameControllers[gameData['gameId']] = gc;
            }

            //Add the socket as a listener
            gc.addSubscriber(socket);

        }).catch(function(error) {
            console.log(error.stack);
            //Emit the error message
            server.emitData(socket, "error", error);
        });
    }

    /**
     * Asks the server to send some data to a given socket
     */
    _public.emitData = function(socketList, type, data) {
        if(socketList.constructor === Array) {
            socketList.forEach(function(socket) {
                server.emitData(socket, type, data);
            });
        }
        else {
            server.emitData(socketList, type, data);
        }
    }
    
    return _public;
};

module.exports = ServerController;