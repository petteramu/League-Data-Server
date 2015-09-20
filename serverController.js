var Database = require('./db.js');
var config = require('./config.js');
var Util = require('./utilities.js');
var Promise = require('bluebird');
var _ = require('underscore');

var serverController = function(server, socket, api, analysisController) {
    var server = server,
        socket = socket,
        data = data,
        champData,
        errorMessage = undefined,
        db = Database.getInstance(),
        analysisController = analysisController,
        utilities = new Util(),
        _this = this;
    
    //Initialize api connection
    var api = api;
    
    //Fetches the data on the game from the 
    function fetchCoreData(apiData, gameData, region) {
        return new Promise(function(resolve, reject) {
            
            getChampionData().then(function(data) {
                apiData['participants'].forEach(function(element) {
                    for (var property in data['data']) {
                        if (data['data'].hasOwnProperty(property) && data['data'][property].key == element.championId) {
                            element.championImage = data['data'][property].image;
                        }
                    }
                });
                
                //Add version
                apiData.version = api.staticData.version;
                
                //Add readable data
                apiData.readableQueue = api.readableQueues[apiData.gameQueueConfigId];
                apiData.readableMap   = api.readableMaps[apiData.mapId];
                
                //Include the participant number in the response
                apiData['participants'].forEach(function(pElement, index) {
                    gameData.pairs.forEach(function(summoner) {
                        if(pElement.summonerId == summoner.summonerId)
                            pElement.participantNo = summoner.participantNo;
                    });
                });

                //Emit the data on the game
                resolve(apiData);
            
            }).catch(function(error) {
                reject(error);
            });
        });
    }
    
    //Returns the fetched champion data if it exists or gets new from the API if not
    function getChampionData() {
        return new Promise(function(resolve, reject) {
            if(typeof champData !== 'undefined') resolve(champData);
            else {
                api.getChampions('image', 'en_GB').then(function(data) {
                    champData = data;
                    resolve(data);
                }).catch(function(error) {
                    console.log("error getting the champion data: " + error);
                    reject(error);
                });
            }
        });
    }
    
    function fetchMatchHistory(gameData) {
        return new Promise(function(resolve, reject) {
            var promises = [];
            
            //Get the champion data from the server controller or the API
            getChampionData().then(function(championData) {
                
                //Iterate all the players in the game
                gameData.pairs.forEach(function(summoner) {
                    promises.push(
                        
                        //Create a new promise to wrap around the api call
                        new Promise(function(resolve, reject) {
                            
                            //API call
                            api.getRecentGamesBySummonerId(gameData.region, summoner.summonerId).then(function(data) {
                                //Handle data
                                
                                //Create a new object for the data
                                var result = {
                                    summonerId: summoner.summonerId,
                                    participantNo: summoner.participantNo,
                                    games: []
                                };
                                
                                //Go to the next entry if the data is not here
                                if(typeof data.games === 'undefined') {
                                    resolve(result);
                                }
                                
                                else {
                                    
                                    //Check to see that the history is not empty
                                    var i;
                                    //Iterate the games and create an object that represents it
                                    for(i = 0; i < data.games.length; i++) {
                                        var game = {
                                            championId: data.games[i]['championId'],
                                            winner: data.games[i]['stats']['win']
                                        }

                                        //Add image data to the response using the champion data
                                        for (var property in champData['data']) {
                                            if (champData['data'].hasOwnProperty(property)
                                                && champData['data'][property].key == game.championId) {
                                                //The champion data contains the given champion
                                                game.championImage = champData['data'][property].image;
                                            }
                                        }
                                        //Insert into the players match history object
                                        result.games.push(game);
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
                        version: api.staticData.version
                    };

                    resolve(response);

                });
                
            }).catch(function(error) {
                reject("Error getting champion data");
            });
        });
    }
    
    //Creates a response for the player roles from a set of rows from the database
    function createRoleResponse(data, gameObject) {
        //Remember: all of the rows in "data" contains a the same "summonerId" value
        var participant = _.find(gameObject.pairs, function(item) {
            return item.summonerId == data[0].summonerId; 
        });
        
        //Holds our response to the client
        var response = {
            summonerId: data[0].summonerId,
            participantNo: participant.participantNo
        };
        
        //Find the total amount of games
        var totalGames = 0;
        data.forEach(function(element) {
          totalGames += element.games;
        });
        
        //Create responses
        data.forEach(function(element) {
            response.summonerId = element.summonerId;
            
            //Find percentage
            var percentage = (element.games * 100) / totalGames;

            //Find a more suitable type of roles
            var realRole = utilities.getRealRole(element.role, element.lane);
            
            if(_.has(response, realRole)) {
                response[realRole].games = response[realRole].games + element.games;
            }
            else {
                //Insert into response
                response[realRole] = {
                    role: realRole,
                    games: element.games,
                    percent: isNaN(percentage) ? 0 : percentage
                }
            }
        });
        
        return response;
    }
    
    function updateSummonerGames(region, summonerId, championIds, rankedQueues, seasons, beginTime, endTime, beginIndex, endIndex) {
        return new Promise(function(resolve, reject) {
            api.getMatchList(gameObject.region, summonerId, null, null, config.currentSeason, null, null, null, null).then(function(data) {
                //Analyse the data
                return analysisController.initializeMatchListAnalysis(summonerId, data);
                
            }, function(error) {
                if(error === 404 || error === 422) {
                    //Player has no games in the given queue ever or since the start of 2013
                    
                    //Log the update time
                    db.logGameUpdate(summonerId);
                    
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
    
    function fetchMostPlayedRole(gameObject) {
        return new Promise(function(resolve, reject) {
            var promises = [];
            
            db.getUpdateTimestamps(_.pluck(gameObject.pairs, 'summonerId')).then(function(lastUpdates) {
                
                //Create the list of promises, one for each player
                gameObject.pairs.forEach(function(summoner) {
                    promises.push(
                        new Promise(function(resolve, reject) {

                            //Get any existing data from the database
                            db.getRoles(summoner.summonerId).then(function(dbData) {

                                //Fetch new data if none exists
                                if(dbData.length == 0) {
                                    updateSummonerGames(gameObject.region, summoner.summonerId, null, null, config.currentSeason, null, null, null, null).then(function(data) {
                                        resolve(createRoleResponse(data, gameObject));

                                    }).catch(function(error) {
                                        reject(error);
                                    });
                                }
                                //If there is data present, check how old it is
                                else {
                                    //Only update once every 24 hours(default)
                                    if((new Date() - new Date(lastUpdates[summoner.summonerId])) / 1000 / 60 / 60 > config.updateIntevals.role) {
                                        updateSummonerGames(gameObject.region,
                                                            summoner.summonerId,
                                                            null, null,
                                                            config.currentSeason,
                                                            new Date(lastUpdates[summoner.summonerId]).getTime() / 1000,
                                                            null, null, null
                                        ).then(function(data) {
                                            resolve(createRoleResponse(data, gameObject));

                                        }).catch(function(error) {
                                            reject(error);
                                        });

                                    }
                                    //Does not need updating, continue to send the data as is
                                    else {
                                        //Resolve the promise
                                        resolve(createRoleResponse(dbData, gameObject));
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
                    
                    //Create
                    var response = {
                        data: responseData,
                        //Add version data to the response
                        version: api.staticData.version
                    };
                    
                    //Ready to send back to client
                    resolve(response);

                });
            
            }).catch(function(error) {
                reject(error);
            });
        });
    }
    
    //Creates the object that is sent to the user which contains league data
    //The dbData var is the data read from the database
    //While the gameData var is the current game data
    function createLeagueDataObject(gameData, dbData) {
        var result = []
        dbData.forEach(function(dbElement) {
            gameData.pairs.forEach(function(summoner) {
                if(dbElement.summonerId == summoner.summonerId) {
                    result.push({
                        participantNo: summoner.participantNo,
                        summonerId: summoner.summonerId,
                        teamId: summoner.teamId,
                        league: dbElement.league,
                        division: dbElement.division,
                        wins: dbElement.wins,
                        losses: dbElement.losses
                    });
                }
            });
        });
        return result;
    }
    
    //Fetches the league information from the db and updates it if necessary
    //TODO: redo
    function fetchLeagueData(gameData, updated) {
        return new Promise(function(resolve, reject) {
            db.getSummonerLeagueData(gameData).then(function(dbData) {

                //If some players do not have league data in the database, update it
                if(!updated) {
                    var requiresUpdate = false;
                    //Find the time since the last update for each player and decide if it needs updating
                    for(var i = 0; i < dbData.length; i++) {
                        //If its more than 3 hours since last update
                        if((new Date() - new Date(dbData[i]['lastUpdated'])) / 1000 / 60 / 60 > 3) {
                            requiresUpdate = true; //Remove summoners that do not require an update
                        }
                    }

                    //All the playes league data can be made in one api call, therefore this function differs from the champion statistics way
                    //The Riot API only takes the summonerIds in this instance
                    var summonerIds = [];
                    gameData.pairs.forEach(function(element) {
                        summonerIds.push(element.summonerId);
                    });
                    
                    //Get new data from the api
                    api.getLeagueEntryBySummonerId(gameData.region, summonerIds).then(function(data) {
                        return db.updateLeagueData(data);
                        
                    }).then(function(rowsUpdated) {
                        //Run again when updated
                        return fetchLeagueData(gameData, true);
                        
                    }).then(function(data) {
                        //On success resolve with the new data
                        resolve(createLeagueDataObject(gameData, data));
                        
                    }).catch(function(error) {
                        console.log("Error while updating league data");
                        reject(error);
                    });
                }

                //Dont return an empty result set
                else if(dbData.length > 0) {
                    resolve(createLeagueDataObject(gameData, dbData));
                }
                else {
                    resolve("Empty result set");
                }
                
            }).catch(function(error) {
                reject(error);
                console.log("Error while fetching league data");
            });
        });
    }
    
    function updateChampData(gameData, data, season) {
        return new Promise(function(resolve, reject) {
            
            //Decide which data need to be updated if any
            var requiresUpdate = [];
            if(typeof data === 'undefined') { //Update all if none are found in the db and the data was not updated beforehand
                gameData.pairs.forEach(function(element) {
                    requiresUpdate.push(element.summonerId);
                });
            }

            //Find the updateneeds based on missing data and time since last update if the data was not updated beforehand
            //Flag summoners that have not been updated in a while
            for(var i = 0; i < data.length; i++) {
                if((new Date() - new Date(data[i]['lastUpdated'])) / 1000 / 60 / 60 > 3) {
                    requiresUpdate.push(data[i].summonerId); //Remove summoners that do not require an update
                }
            }

            //Flag summoners that have no entry in the database
            var i = 0;
            gameData.pairs.forEach(function(element) { //Iterate all data given from the server
                var found = false;
                data.forEach(function(pairElement) { //Iterate all data from the db
                    if(pairElement.summonerId == element.summonerId)
                        found = true;
                });

                if(!found) //If the summoner was not found in the data from the db, it requires an update
                    requiresUpdate.push(element.summonerId);
            });

            
            //If something requires an update
            if(requiresUpdate.length > 0) {
                console.log("Updating champ data for: %s", requiresUpdate.length);
                
                //Create promises
                var promises = [];
                //Start the update
                requiresUpdate.forEach(function(summonerId) {
                    promises.push(api.getRankedStatsBySummonerId(gameData.region, summonerId));
                });
                
                //Wait for the promises to finish
                Promise.all(promises).then(function(data) {
                    //Update the data
                    if(data.length > 0) {
                        data.forEach(function(element) {
                            db.updateChampData(element);
                        });
                        
                        //Resolve with the new data from the API
                        resolve();
                        return;
                    }
                    
                    //If no data was fetched from the API, reject the promise
                    reject();
                    
                }).catch(function(error) {
                    reject(error);
                });
            //Reject if none required an update
            } else {
                reject();
            }
        });
    }
    
    //Fetches the champion statistics from the db and updates it if necessary
    //"Updated" tells the function if the data has been updated prior to calling it, since it can be updated without being visible in the data(no champ stats etc).
    function fetchChampData(gameData, updated) {
        return new Promise(function(resolve, reject) {
            //Get information on the champions of summoners from the database
            var dbData, response;
            db.getSummonerChampData(gameData).then(function(data) {
                dbData = data;
                return updateChampData(gameData, data, 'SEASON2015');
                
            }).then(function() {
                //There was some data updated, retrieve data again
                return db.getSummonerChampData(gameData);
                
            }).then(function(newData) {
                //Set the data to the new data since it was updated
                dbData = newData;
                return Promise.resolve();
                
            }).catch(function(error) {
                if(typeof error === 'undefined') console.log("Updating 0 champion statistics");
                return Promise.resolve();
            
            }).then(function() {
                response = JSON.parse(JSON.stringify(gameData)); //Clone gameData object

                //Noone needs updating
                //Now include the participant number in the response and set the type
                dbData.forEach(function(dbElement, index) {
                    response.pairs.forEach(function(responseElement) {
                        if(dbElement.summonerId == responseElement.summonerId) {
                            responseElement.playerOnChampion = dbElement;
                        }
                    });
                });
                
                resolve(response);
                    
            }).catch(function(error) {
                console.log("error: %s", error);
                reject(error);
            });
        });
    }
    
    //Fetches the champion statistics from the db and updates it if necessary
    function fetchMostPlayedChampions(gameData, amount) {
        return new Promise(function(resolve, reject) {
            
            //Get information on the champions of summoners from the database
            db.getSummonerMostPlayed(gameData, amount).then(function(dbData) {
                var response = JSON.parse(JSON.stringify(gameData)); //Clone gameData object

                //Add version number
                response.version = api.staticData.version;

                //Get static champion data
                var championData = getChampionData().then(function(data) {

                    //Create data structure
                    var i;
                    for(i = 0; i < dbData.length; i++) {
                        var row = dbData[i];

                        //Add image data to the response
                        for (var property in data['data']) {
                            if (data['data'].hasOwnProperty(property) && data['data'][property].key == row.championId) {
                                row.championImage = data['data'][property].image;
                            }
                        }

                        //Add the database data to the response
                        var i2;
                        for(i2 = 0; i2 < response['pairs'].length; i2++) {
                            if(response['pairs'][i2].summonerId == row.summonerId) {
                                //Set the data parameter if it does not exist
                                if(typeof response['pairs'][i2].data === 'undefined') {
                                    response['pairs'][i2].data = [];
                                }
                                response['pairs'][i2].data.push(row);
                            }
                        }
                    }

                    //Resolve with data
                    resolve(response);
                    
                //Handle errors returned from champion data    
                }).catch(function(error) {
                console.log("Error in most played: %s", err);
                    reject(error);
                });
                
            //Handle errors from the database
            }).catch(function(error) {
                reject(error);
                console.log("Error in most played: %s", error);
            });
        });
    }
    
    //Create an object containing summonerId and the corresponding championId
    function createGameObject(data, region) {
        
        var summonerChampPairs = [];
        data['participants'].forEach(function(element, index) {
            summonerChampPairs.push({
                summonerId: element.summonerId,
                championId: element.championId,
                //The first 5 in the list from the API is on blue(100) team, the next are on the purple(200)
                //The participant number goes from 101-105 and 201 to 205, therefore +1 and -4
                //This is because the id 100 is used to identify the team itself
                participantNo: (element.teamId == 100) ? element.teamId + index + 1: element.teamId + index - 4,
                teamId: element.teamId
            });
        });

        //Filter out unranked queuetypes to become soloQ
        var gameType = ( gameType == 41 || gameType == 42 ) ? api.queues[data['gameQueueConfigId']] : api.queues[4];

        //Return actual object
        return gameObject = {
            pairs: summonerChampPairs,
            gameType: gameType,
            region: region,
            gameId: data.gameId
        }
    }
        
    function handleErrorMessage(error, location) {
        //Handle error
        if(typeof errorMessage === 'undefined') {
            //An error message was not defined earlier, therefore we attempt to fetch the rest of the data as this data is not crucial
            errorMessage = "Could not fetch " + location + " data";

            //Continue sending other data
            server.emitData(socket, "error", {
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
    
    //Public
    return {
        //Starts the process of creating data on the curret game of a summoner
        //Handles the errors from the API, but does not handle the data itself
        //Handling the data is done by the private functions of this class
        createCurrentGameData: function(options) {
            if( options.name === '' ) {
                server.emitData({"error": "No name provided"}, socket);
                return;
            }
            
            //Normalize name
            var name = options.name.toLowerCase().replace(" ", ""),
                region = options.region || 'euw',
                _this = this,
                cancel = false;
            
            var gameObject, gameData;
            
            //Get the summonerId of the player
            api.getSummonerByName(region, name)
            .catch(function(error) {
                //Handle the error                
                //Set the errormessage so no future errors are created
                errorMessage = "No summoner by that name";
                
                //Reject the promise so we do not continue attempting to get data
                return Promise.reject(errorMessage);
                
            }).then(function(data) {
                //Continue with getting the actual game data
                return api.getCurrentGame(region, data[name]['id']);
                
            }).catch(function(error) {
                //If the "randomGame" parameter is set, it means we must now go back to the randomgame function to find a new game that actually is going
                if(options.randomGame) {
                    _this.getRandomFeaturedGame(region);
                    console.log("Rerunning");
                    cancel = true;
                    return Promise.reject();
                }
                
                //Handle the error
                
                //If an error message is already defined, it means it is passed from a previous promise.
                errorMessage = (typeof errorMessage === 'undefined') ? "Summoner currently not in a game" : errorMessage; 
                
                return Promise.reject(errorMessage);
                
            //Handle data and proceed
            }).then(function(data) {
                //Save
                gameData = data;
                //Create game object    
                gameObject = createGameObject(data, region);
                
                //Assemble and send data
                return fetchCoreData(data, gameObject, region);
                
            }).catch(function(error) {
                //Handle error                
                errorMessage = (typeof errorMessage === 'undefined') ? "Could not fetch core data" : errorMessage;
                
                return Promise.reject(errorMessage);
            
            //Send core data and proceed
            }).then(function(data) {
                server.emitData(socket, "core", data);
                //Get statistics on the leagues of each player
                return fetchLeagueData(gameObject);
                
            }).catch(function(error) {
                return handleErrorMessage(error, "league");
                
            //Send league data and proceed
            }).then(function(data) {
                //If "data" is "false", do not send data, as there was an error
                if(data !== false) server.emitData(socket, "leaguedata", data);
                
                //Get statistics on the champions each play plays
                return fetchChampData(gameObject);
//                return Promise.resolve();
            
            }).catch(function(error) {
                return handleErrorMessage(error, "champion");
                
            //Send champ data and proceed
            }).then(function(data) {
                //If "data" is "false", do not send data, as there was an error
                if(data !== false) server.emitData(socket, "champdata", data);
                
                //Send the match history of each player
                return fetchMatchHistory(gameObject);
//                return Promise.resolve();
                
            }).catch(function(error) {
                return handleErrorMessage(error, "matchhistory");
                
            //Send match history data
            }).then(function(data) {
                //If "data" is "false", do not send data, as there was an error
                if(data !== false) server.emitData(socket, "matchhistory", data);
                
                //Fetch the most played champions of each player
                var numberOfTopChamps = 5; //TODO: Create config file
                return fetchMostPlayedChampions(gameObject, numberOfTopChamps);
//                return Promise.resolve();
                
            }).then(function(data) {
                server.emitData(socket, "mostplayed", data);
                
                return fetchMostPlayedRole(gameObject);
            }).catch(function(error) {
                return handleErrorMessage(error, "most played champions");
                
            }).then(function(data) {
                server.emitData(socket, "roles", data);
                
            }).catch(function(error) {
                //Handle error
                console.log(error.stack);
                if(typeof errorMessage != 'undefined') {
                    //Do not send an error if we just get a new game
                    if(!cancel) {
                        server.emitData(socket, "error", {
                            type: "crucial",
                            error: error
                        });
                    }
                }
            });
        },
        
        
        //This method loads the current featured games from the given region and sends back a random games information
        getRandomFeaturedGame: function(regionData) {
            var _this = this;
            
            //First get the list of featured games from the API
            api.getFeaturedGames(regionData.region).then(function(data) {
                var num = data['gameList'].length;
                var rand = Math.floor(Math.random() * num);
                
                //Create current game request for the random game
                _this.createCurrentGameData({
                    name: data['gameList'][rand]['participants'][0]['summonerName'],
                    region: regionData.region,
                    randomGame: true
                });
                
            }).catch(function(error) {
                server.emitData(socket, "error", {
                    type: "randomfeatured",
                    error: "Could not fetch featured games"
                });
            });
        }
    }
}

module.exports = serverController;