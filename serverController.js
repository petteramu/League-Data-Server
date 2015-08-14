var Database = require('./db.js');

var serverController = function(server, socket, api) {
    var server = server;
    var socket = socket;
    var data = data;
    var champData;
    var db = Database.getInstance();
    var _this = this;
    
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

                apiData.version = api.staticData.version;

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
                                console.log(error);
                                reject("Error while getting the data from the API");
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

                }, function(error) {
                    console.log("error in match history");
                    reject(error);
                });
                
            }).catch(function(error) {
                reject("Error getting champion data");
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
                //Problem with the datqabase
                if(typeof error === 'undefined') console.log("Updating 0 champion statistics");
                return Promise.resolve(error);
            
            }).then(function() {
                //Dont send an empty result set
                if(dbData.length == 0) return Promise.reject();
                
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
                
                //Fetch champion averages
                return db.getChampionAverages(gameData);
            
            }).then(function(avgData) {
                //Now include the averages in the response
                avgData.forEach(function(avgElement, index) {
                    var found = false;
                    response.pairs.forEach(function(responseElement) {
                        if(avgElement.championId == responseElement.championId) {
                            responseElement.average = avgElement;
                            found = true;
                        }
                    });
                });

                //Resolve the promise
                resolve(response);
                    
            }).catch(function(error) {
                console.log(error);
                reject(err);
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
            region: region
        }
    }
    
    return {
        //Starts the process of creating data on the curret game of a summoner
        //Handles the errors from the API, but does not handle the data itself
        //Handling the data is done by the private functions of this class
        createCurrentGameData: function(data) {
            if( data.name === '' ) {
                server.emitData({"error": "No name provided"}, socket);
                return;
            }
            var name = data.name.toLowerCase();
            var region = data.region || 'euw';
            
            var gameObject, gameData, errorMessage;
            
            //Get the summonerId of the player
            api.getSummonerByName(region, name)
            .catch(function(error) {
                //Handle the error
                console.log(error.stack);
                errorMessage = "No summoner by that name";
                return Promise.Reject(errorMessage);
                
            }).then(function(data) {
                //Continue with getting the actual game data
                return api.getCurrentGame(region, data[name]['id']);
                
            }).catch(function(error) {
                //Handle the error
                console.log(error.stack);
                errorMessage = (typeof errorMessage === 'undefined') ? "Summoner currently not in a game" : errorMessage; 
            
                return Promise.Reject(errorMessage);
                
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
                console.log(error.stack);
                errorMessage = (typeof errorMessage === 'undefined') ? "Could not fetch core data" : errorMessage; 
                return Promise.Reject(errorMessage);
            
            //Send core data and proceed
            }).then(function(data) {
                server.emitData(null, socket, "core", data);
                //Get statistics on the leagues of each player
                return fetchLeagueData(gameObject);
                
            }).catch(function(error) {
                //Handle error
                console.log(error.stack);
                errorMessage = (typeof errorMessage === 'undefined') ? "Could net fetch league data" : errorMessage; 
                
                //Continue sending other data
                return Promise.Reject(errorMessage);
                
            //Send league data and proceed
            }).then(function(data) {
                server.emitData(null, socket, "leaguedata", data);
                //Get statistics on the champions each play plays
                return fetchChampData(gameObject);
            
            }).catch(function(error) {
                //Handle error
                console.log(error.stack);
                errorMessage = (typeof errorMessage === 'undefined') ? "Could not fetch champ data" : errorMessage; 
                
                //Continue sending other data
                return Promise.Reject(errorMessage);
                
            //Send champ data and proceed
            }).then(function(data) {
                server.emitData(null, socket, "champdata", data);
                //Send the match history of each player
                return fetchMatchHistory(gameObject);
                
            }).catch(function(error) {
                console.log(error.stack);
                errorMessage = (typeof errorMessage === 'undefined') ? "Error while getting match history" : errorMessage;
                return Promise.Reject(errorMessage);
                
            //Send match history data
            }).then(function(data) {
                server.emitData(null, socket, "matchhistory", data);
                
                return fetchMostPlayedChampions(gameObject, 5);
                
            }).then(function(data) {
                server.emitData(null, socket, "mostplayed", data);
            
            }).catch(function(error) {
                console.log(error.stack);
                console.log(errorMessage);
            });
        }
    }
}

module.exports = serverController;