var MatchHistoryElement = require('../Model/MatchHistoryElement.js'),
    Database = require('../Database/Database.js'),
    Promise = require('bluebird'),
    _ = require('underscore'),
    config = require('../Config/config.js'),
    RiotAPI = require('../API/RiotAPI.js'),
    AnalysisController = require('../Controllers/AnalysisController.js');

/**
 * This class has the responsibility to fetch and update the data that are
 * required in the GameController class.
 * Its public functions are only fetch functions; the update functons are private
 * @param {RiotAPI}  An instance handling the requests to the Riot Games API
 * @param {Database} An instance handling the connection to the MySQL database
 */
var DataHandler = (function() {
    
    /**
     * Updates the rankings data of each of the summoners in the game.
     * Both fetches and saves the data in the database,
     * @param {List<Integer>} summonerIds A List of summonerIds that require an update
     */
    function updateLeagueData(summonerIds, region, dbData) {
        return new Promise(function(resolve, reject) {
            //All the playes league data can be made in one api call, so we update for everyone

            //Get new data from the api
            RiotAPI.getLeagueEntryBySummonerId(region, summonerIds).then(function(data) {
                return Database.updateLeagueData(data);

            }).then(function(rows) {
                resolve(rows);

            }).catch(function(error) {
                reject(error);
            });
        });
    }
        
    /**
     * Updates the champion statistics of the summoners
     * @param {List} summoners A List of objects containing summonerIds and regions of summoners
     * @param {String} region
     * @return {Promise} A Promise
     */
    function updateChampData(summoners, region) {
        return new Promise(function(resolve, reject) {
            //Download the new data for any summoners that was put in the requires update list
            console.log("Updating champ data for: %s", summoners.length);

            //Create promises
            var promises = [];
            
            //Start the update
            summoners.forEach(function(summonerId) {
                promises.push(RiotAPI.getRankedStatsBySummonerId(region, summonerId));
            });

            //Wait for the promises to finish
            Promise.settle(promises).then(function(settledPromises) {
                var amountUpdated = 0;

                settledPromises.forEach(function(promise) {
                    //Check if the promise was resolved
                    if(promise.isFulfilled()) {
                        //Update the data if there are data present
                        Database.updateChampData(promise.value());
                        amountUpdated += 1;
                    }
                });

                //Resolve the promise
                resolve(amountUpdated);

            }).catch(function(error) {
                reject(error);
            });
        });
    }
    
    /**
     * Updates the games of a single summoner
     * @param {String} region
     * @param {String} summonerId
     * @param {List<Interger>} championIds
     * @param {List<String>} rankedQueues
     * @param {List<String>} seasons
     * @param {Long} beginTime The earliest date to get games from
     * @param {Long} endTime The latest date to get games from
     * @param {Integer} beginIndex
     * @param {Integer} endIndex
     */
    function updateSummonerGames(region, summonerId, championIds, rankedQueues, seasons, beginTime, endTime, beginIndex, endIndex) {
        return new Promise(function(resolve, reject) {
            RiotAPI.getMatchList(region, summonerId, null, null, config.currentSeason, null, null, null, null).then(function(data) {
                //Analyse the data
                return AnalysisController.initializeMatchListAnalysis(summonerId, data);
                
            }, function(error) {
                //Handles errors with the match list endpoint
                
                //Player has no games in the given queue ever or since the start of 2013
                if(error === 404 || error === 422) {
                    
                    //Log the update time
                    Database.logGameUpdate(summonerId);
                    
                    //Reject with 404 as the reason
                    reject(404);
                }
                else {
                    //TODO: handle better
                    console.log(error);
                }
            
            }).catch(function(error) {
                //If we get here there was a problem in the analysiscontroller
                reject(error);
                
            }).then(function(analysedData) {
                //Return the newly found data
                resolve(analysedData);
            });
        });
    }
    
    /**
     * Takes a list of summoners in a game, the formatted core data from that game and returns a list of summoners whose data needs to be updated
     * @param {List} summoners A List of objects containing summonerIds and regions of summoners
     * @param {Object} data The currently existing data from the database
     * @return {List} A List of summonerIds that needs updating
     */
    function findUpdateNeeds(summoners, data, type) {
        var requiresUpdate = [];

        //Update all if none are found in the db and the data was not updated beforehand
        if(typeof data === 'undefined') {
            summoners.forEach(function(element) {
                requiresUpdate.push(element.summonerId);
            });
            //Skip rest of the function
            return requiresUpdate;
        }

        //Find the updateneeds based on missing data and time since last update if the data was not updated beforehand
        //Flag summoners that have not been updated in a while
        for(var i = 0; i < data.length; i++) {
            if((new Date() - new Date(data[i]['lastUpdated'])) / 1000 / 60 / 60 > config.updateIntevals[type]) {
                requiresUpdate.push(data[i].summonerId); //Remove summoners that do not require an update
            }
        }

        //Flag summoners that have no entry in the database
        var i = 0;
        summoners.forEach(function(element) { //Iterate all data given from the server
            var found = false;
            data.forEach(function(pairElement) { //Iterate all data from the db
                if(pairElement.summonerId == element.summonerId)
                    found = true;
            });

            if(!found) //If the summoner was not found in the data from the db, it requires an update
                requiresUpdate.push(element.summonerId);
        });
        
        return requiresUpdate;
    }
    
    return {
        //The current version og League of Legends
        version: RiotAPI.staticData.version,
        
        /**
         * Fetches the league information from the db and updates it if necessary
         * @param {Object} The formatted core data of the game of which league data is requested
         * @return {Promise} A Promise with an Object containing the raw data from the database
         */
        fetchLeagueData: function(summoners) {
            return new Promise(function(resolve, reject) {
                //Get existing data from database
                //We are only interested in the summoners solo rating
                Database.getSummonerLeagueData(summoners, 'RANKED_SOLO_5X5').then(function(dbData) {
                    var requiresUpdate = findUpdateNeeds(summoners, dbData, "league");
                    
                    //Update the data if necessary and fetch the new data, or return the original data if not
                    return (requiresUpdate.length == 0 ) ? dbData : updateLeagueData(requiresUpdate, summoners[0].region, dbData)
                        .then(function(data) {
                            return Database.getSummonerLeagueData(summoners, 'RANKED_SOLO_5X5')
                        });
        
                }).then(function(updated) {
                    //"updated" is now either the original data or updated data if it was updated
                    resolve(updated);
                }).catch(function(error) {
                    // There was no data, resolve without results
                    if(error.statusCode == 404) {
                        resolve([]);
                    }
                    else {
                        console.log("Could not find league data");
                        console.log(error.stack);
                        reject(error);
                    }
                });
            });
        },
        
        /**
         * Fetches the league information from the db and updates it if necessary
         * @param {List<Summoner>} A List of Summoners
         * @return {Promise} A Promise with an Object containing the raw data from the database
         */
        fetchChampionData: function(summoners) {
            return new Promise(function(resolve, reject) {
                //Get information on the champions of summoners from the database
                var dbData;
                Database.getSummonerChampData(summoners).then(function(data) {
                    dbData = data;
                    
                    //Find which summoners need an update
                    var requiresUpdate = findUpdateNeeds(summoners, data, "champion");
                    if(requiresUpdate.length > 0) {
                        //Update those summoners statistics
                        return updateChampData(requiresUpdate, summoners[0].region);
                    }
                    else {
                        return Promise.resolve(0);
                    }

                }).then(function(amountUpdated) {
                    //How many were updated?
                    //If 0, use the already existing data
                    if(amountUpdated == 0) {
                        return dbData;
                    }
                    else {
                        //There was some data updated, retrieve data again
                        return Database.getSummonerChampData(summoners);
                    }
                    
                }).then(function(data) {
                    resolve(data);

                }).catch(function(error) {
                    console.log("error: %s", error);
                    reject(error);
                });
            });
        },
        
        /**
         * Gets the matchhistory data from the RiotAPI for each summoner
         * @param {List<Summoner>} summoners A List of summoners to get the matchhistory of
         * @return {Promise} A promise with the formatted data
         */
        fetchMatchHistory: function(summoners, championData) {
            return new Promise(function(resolve, reject) {
                var promises = [];

                //Iterate all the players in the game
                summoners.forEach(function(summoner) {
                    promises.push(

                        //Create a new promise to wrap around the api call
                        new Promise(function(resolve, reject) {

                            //API call
                            RiotAPI.getRecentGamesBySummonerId(summoner.region, summoner.summonerId).then(function(data) {
                                //Handle data

                                //Create a new object for the data
                                var result = {
                                    summonerId: summoner.summonerId,
                                    participantNo: summoner.participantNo,
                                    games: []
                                };

                                //Resolve with empty game set if no data exists
                                if(typeof data.games === 'undefined') {
                                    resolve(result);
                                }

                                else {
                                    var i;
                                    //Iterate the games and create an object that represents it
                                    for(i = 0; i < data.games.length; i++) {
                                        //Add image data to the response using the champion data
                                        for (var property in championData['data']) {
                                            if (championData['data'].hasOwnProperty(property)
                                                && championData['data'][property].key == data.games[i].championId) {
                                                //The champion data contains the given champion, create history element
                                                var game = new MatchHistoryElement(data.games[i]['championId'], data.games[i]['stats']['win'], championData['data'][property].image);
                                            }
                                        }

                                        if(typeof game !== 'undefined') {
                                            //Insert into the players match history object
                                            result.games.push(game);
                                        }
                                    }

                                    resolve(result);
                                }
                            //Catch errors from the API
                            }).catch(function(error) {
                                console.log(error.stack);
                                //We resolve anyway since we dont want to throw away the rest of the data
                                resolve();
                            });
                        })
                    );
                });

                //Wait for all the calls to finish
                Promise.all(promises).then(function(data) {
                    var response = {
                        data: data,
                        //Add version data to the response
                        version: RiotAPI.staticData.version
                    };

                    resolve(response);

                });
            });
        },
        
        /**
         * Fetches the most played roles of a set of summoners, with statistics on games and winrate
         * @param {List<Summoner>} summoners A List of Summoners
         * @return {Promise} A Promise that resolves with a set of roles for each summoner
         */
        fetchMostPlayedRole: function(summoners) {
            return new Promise(function(resolve, reject) {
                var promises = [];

                //Find the last time the statistics were updated
                Database.getUpdateTimestamps(_.pluck(summoners, 'summonerId')).then(function(lastUpdates) {

                    //Create the list of promises, one for each player
                    summoners.forEach(function(summoner) {
                        promises.push(
                            new Promise(function(resolve, reject) {

                                //Get any existing data from the database
                                Database.getRoles(summoner.summonerId).then(function(dbData) {

                                    //Fetch new data if none exists
                                    if(dbData.length == 0) {
                                        updateSummonerGames(summoner.region, 
                                                            summoner.summonerId, 
                                                            null, null,
                                                            config.currentSeason,
                                                            null, null, null, null
                                        ).then(function(data) {
                                            resolve(data);

                                        }).catch(function(error) {
                                            reject(error);
                                        });
                                    }
                                    //If there is data present, check how old it is
                                    else {
                                        //Only update once every 24 hours(default)
                                        if((new Date() - new Date(lastUpdates[summoner.summonerId])) / 1000 / 60 / 60 > config.updateIntevals.role) {
                                            updateSummonerGames(summoner.region,
                                                                summoner.summonerId,
                                                                null, null,
                                                                config.currentSeason,
                                                                new Date(lastUpdates[summoner.summonerId]).getTime() / 1000,
                                                                null, null, null
                                            ).then(function(data) {
                                                resolve(data);

                                            }).catch(function(error) {
                                                reject(error);
                                            });

                                        }
                                        //Does not need updating, continue to send the data as is
                                        else {
                                            //Resolve the promise
                                            resolve(dbData);
                                        }
                                    }

                                });
                            })
                        );
                    });

                    //Wait for all the calls to finish
                    Promise.settle(promises).then(function(data) {
                        var responseData = [];
                        
                        data.forEach(function(promise) {
                            if(promise.isFulfilled()) {
                                responseData.push(promise.value());
                            }
                        });

                        //Ready to send back to client
                        resolve(responseData);

                    });

                }).catch(function(error) {
                    reject(error);
                });
            });
        },
        
        /**
         * Fetches the champion statistics from the db and updates it if necessary
         * Does not update the champion data as that should have been done previously if necesary
         * @param {List<Summoner>} summoners A List of Summoners
         * @param {Integer} amount The amount of champions to fetch
         * @return {Promise} A Promise that will resolve with the data for each summoner
         */
        fetchMostPlayedChampions: function(summoners, amount) {
            return new Promise(function(resolve, reject) {

                //Get information on the champions of summoners from the database
                Database.getSummonerMostPlayed(summoners, amount).then(function(dbData) {
                    //Resolve with data
                    resolve(dbData);

                //Handle errors from the database
                }).catch(function(error) {
                    reject(error);
                    console.log("Error in most played champions: %s", error);
                });
            });
        },
        
        /**
         * Updates the data on champions that is stored in the database
         */
        updateChampionsData: function() {
            //Update champion base in db
            RiotAPI.getChampionsData('euw').then(function(data) {
                return Database.updateChampionTable(data['data']);
            }).then(function(rows) {
                console.log("Static champion data updated successfully");
            }).catch(function(error) {
                console.log("Error while updating static champion data");
                console.log(error.stack);
            });
        },
    
        /**
         * Returns static champion data from the API
         * NOTE: This data is different from the data in the database
         * Contains information on sprites.
         */
        getStaticChampionData: function() {
            return new Promise(function(resolve, reject) {
                RiotAPI.getChampions('image', 'en_GB').then(function(data) {
                    resolve(data);
                }).catch(function(error) {
                    console.log("error getting the champion data: " + error);
                    reject(error);
                });
            });
        },
    
        /**
         * Returns static rune data from the API
         */
        getStaticRuneData: function() {
            return new Promise(function(resolve, reject) {
                RiotAPI.getRunes('en_GB').then(function(data) {
                    resolve(data);
                }).catch(function(error) {
                    console.log("error getting the rune data: " + error);
                    reject(error);
                });
            });
        },
    
        /**
         * Returns static rune data from the API
         */
        getStaticMasteryData: function() {
            return new Promise(function(resolve, reject) {
                RiotAPI.getMasteries('en_GB').then(function(data) {
                    resolve(data);
                }).catch(function(error) {
                    console.log("error getting the mastery data: " + error);
                    reject(error);
                });
            });
        }
    }
}());

module.exports = DataHandler;