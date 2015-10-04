var DataFormatter = require('../Data/DataFormatter.js'),
    DataHandler = require('../Data/DataHandler.js'),
    Summoner = require('../Model/Summoner.js'),
    GameSubscriber = require('../Model/GameSubscriber.js'),
    Promise = require('bluebird'),
    config = require('../Config/config.js'),
    AnalysisController = require('./AnalysisController.js'),
    RiotAPI = require('../API/RiotAPI.js');

/**
 * This is the controller for the games. Each instance represents one game.
 * Its responsibilities are to have an overview of subscribers to a game,
 * cache the data, and send it once it has been fetched.
 * @param {Object} coreData The core data of a game
 * @param {region} region
 */
var GameController = function(coreData, region) {
    var gameId = gameId,
        region = region,
        champData;
    
    //Cache object
    //Having the data being cached in each of the GameController objects means it is automatically dispensed when this object is removed
    var cache = {};
    
    //Sockets
    //A subscriber is represented by an object consisting of:
    //- The socket of the subscriber
    //- A boolean representation of each of the data types, true if it has been sent and recieved, false if not
    var subscribers = [];
    
    /**
     * Asks the server to send the data to the subscribers that have not yet received the information
     * @param {String} stage
     * @param {Object} data
     */
    function emitData(stage, data) {
        var wrap = {};
        wrap[stage] = data;
        
        console.log("Sending " + stage);
        //Find the subscribers that require this data
        subscribers.forEach(function(subscriber) {
            if(!subscriber.stages[stage]) {
                //Set the stage to sent
                subscriber.setStage(stage, true);
                
                subscriber.socket.emit("message", wrap);
            }
        });
    }
    
    /**
     * Send data that has already been loaded to a socket that has not received these
     * @param {Subscriber} subscriber
     */
    function afterSendData(subscriber) {
        for(var property in cache) {
            //Iterate each stage
            if (cache.hasOwnProperty(property)
               && !subscriber.stages[property]
               && cache[property]) {
                //Send data since it has not been sent yet
                console.log(1);
                subscriber.socket.emit(property, cache[property]);
            }
        }
    }
    
    /**
     * Starts the pipeline that gets all the necessary data in order
     * Send the data when it is done
     */
    function getData() {
        //Starts the process of creating data on the given game

        //Get statistics on the leagues of each player
        DataHandler.fetchLeagueData(getSummonerList(), cache.core.gameType).catch(function(error) {
            return handleErrorMessage(error, "league");
            
        //Send league data and proceed
        }).then(function(data) {
            //If "data" is "false", do not send data, as there was a non-crucial error in a previous promise
            //We continue because it is not crucial data, and the rest should still be sent.
            if(data !== false) {
                //Store data
                cache.league = DataFormatter.formatLeagueData(data, getSummonerList());
                emitData("league", cache.league);
            }

            //Get statistics on the champions each play plays
            return DataHandler.fetchChampionData(getSummonerList());

        }).catch(function(error) {
            return handleErrorMessage(error, "champion");

        //Send champ data and proceed
        }).then(function(data) {
            //If "data" is "false", do not send data, as there was a non-crucial error in a previous promise
            //We continue because it is not crucial data, and the rest should still be sent.
            if(data !== false) {
                //Store data
                cache.champion = DataFormatter.formatChampData(data, getSummonerList());
                emitData("champion", cache.champion);
            }

            //Send the match history of each player
            return DataHandler.fetchMatchHistory(getSummonerList(), champData);

        }).catch(function(error) {
            return handleErrorMessage(error, "matchhistory");

        //Send match history data
        }).then(function(data) {
            //If "data" is "false", do not send data, as there was a non-crucial error in a previous promise
            //We continue because it is not crucial data, and the rest should still be sent.
            if(data !== false) {
                //Store data
                cache.matchhistory = data; //Is already formatted
                emitData("matchhistory", cache.matchhistory);
            }

            //Fetch the most played champions of each player
            return DataHandler.fetchMostPlayedChampions(getSummonerList(), config.numberOfTopChampions);
            
        }).catch(function(error) {
            return handleErrorMessage(error, "most played champions");

        //Handle the most played champion data
        }).then(function(data) {
            //If "data" is "false", do not send data, as there was a non-crucial error in a previous promise
            //We continue because it is not crucial data, and the rest should still be sent.
            if(data !== false) {
                //Store data
                cache.mostplayed = DataFormatter.formatMostPlayedChampions(data, getSummonerList());
                emitData("mostplayed", cache.mostplayed);
            }

            return DataHandler.fetchMostPlayedRole(getSummonerList());
            
        }).catch(function(error) {
            return handleErrorMessage(error, "most played roles");

        }).then(function(data) {
            //If "data" is "false", do not send data, as there was a non-crucial error in a previous promise
            //We continue because it is not crucial data, and the rest should still be sent.
            if(data !== false) {
                //Store data
                cache.roles = DataFormatter.formatRoleData(data);
                emitData("roles", cache.roles);
            }

        }).catch(function(error) {
            //Handle errors that are passed all the way down
            console.log(error.stack);
            if(typeof errorMessage != 'undefined') {
                //Do not send an error if we just get a new game
                emitData("error", {
                    type: "crucial",
                    error: error
                });
            }
        });
    }
        
    /**
     * Handles an error message by sending the message to clients and deciding whether or not it is crucial
     * @param {Object} error
     * @param {String} location Where in the process it happened.
     */
    function handleErrorMessage(error, location) {
        console.log(error.stack);
        //Handle error
        if(typeof errorMessage === 'undefined') {
            //An error message was not defined earlier, therefore we attempt to fetch the rest of the data as this data is not crucial
            errorMessage = "Could not fetch " + location + " data";

            //Continue sending other data
            emitData("error", {
                location: location,
                error: errorMessage
            });

            //Resolve with false to not send data
            return Promise.resolve(false);
        }
        else {
            //Reject if some error was defined earlier, as that means crucial data is missing
            return Promise.reject(errorMessage);
        }
    }
        
    /**
     * Creates a list of the summonerIds and regions of the summoners
     * @param {Object} data The raw core data
     */
    function getSummonerList() {
        return cache.core.redTeam.concat(cache.core.blueTeam);
    }
    
    //Constructor
    (function() {
        //Get the champion data
        DataHandler.getStaticChampionData().then(function(championData) {
            //Store data
            champData = championData;
            
            //Format core data then begin retreiving data
            return DataFormatter.formatCoreData(coreData, championData, region, RiotAPI.staticData.version);
            
        }).then(function(formatted) {
            //Save the data
            cache.core = formatted;
            //Send the core data
            emitData("core", formatted);
            //Start receiving the rest of the data
            getData();
        
        }).catch(function(error) {
            console.log(error.stack);
            console.log("Error while initializing game controller");
        });
    })();
    
    //Public functions
    return {
        /**
         * Adds a subscriber
         * @param {Socket} socket The socket to add
         */
        addSubscriber: function(socket) {
            var sub = new GameSubscriber(socket);
            
            //Add the subscriber to the list
            subscribers.push(sub);
            
            //Send already existing data
            afterSendData(sub);
        },
        
        /**
         * Removes a subscriber
         * @param {Socket} socket The socket to remove
         */
        removeSubscriber: function(socket) {
            subscribers.forEach(function(sub, index) {
                if(sub.socket === socket) {
                    //Remove from list
                    subscribers.splice(index, 1);
                }
            });
        }
    };
};

module.exports = GameController;