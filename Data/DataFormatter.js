"use strict";

var Promise = require('bluebird'),
    _ = require('underscore'),
    Readables = require('../Utils/Readables.js'),
    Summoner = require('../Model/Summoner.js'),
    Utilities = require('../Utils/utilities.js');

var DataFormatter = (function() {
    return {
        /**
         * Formats the core data into a better structure with only the needed information
         * @param {Object} coreData The raw core data
         * @param {String} region
         */
        formatCoreData: function(coreData, championData, region, version) {
            return new Promise(function(resolve, reject) {
                var formattedResponse = {
                    type: "core",
                    blueTeam: [],
                    redTeam:  [],
                    version: version,
                    queue: Readables.readableQueues[coreData.gameQueueConfigId],
                    map: Readables.readableMaps[coreData.mapId],
                    region: region
                };

                //Create the formatted participant objects
                coreData['participants'].forEach(function(element) {
                    //The first 5 in the list from the API is on blue(100) team, the next are on the purple(200)
                    //The participant number goes from 101-105 and 201 to 205
                    //The length of the team in the formatted response is used to create the participant numbers
                    var pNo = (element.teamId == 100) ? element.teamId + formattedResponse.blueTeam.length + 1 : element.teamId + formattedResponse.redTeam.length + 1;

                    var summonerObject = new Summoner(element.summonerId, element.summonerName, pNo, element.championId, element.teamId, region);

                    //Insert into the correct list
                    if(element.teamId == 100) {
                        formattedResponse.blueTeam.push(summonerObject);
                    }
                    else {
                        formattedResponse.redTeam.push(summonerObject);
                    }
                });

                //Iterate the teams and insert champion image information
                formattedResponse.blueTeam.forEach(function(element) {
                    for (var property in championData['data']) {
                        if (championData['data'].hasOwnProperty(property) && championData['data'][property].key == element.championId) {
                            element.championImage = championData['data'][property].image;
                        }
                    }
                });

                formattedResponse.redTeam.forEach(function(element) {
                    for (var property in championData['data']) {
                        if (championData['data'].hasOwnProperty(property) && championData['data'][property].key == element.championId) {
                            element.championImage = championData['data'][property].image;
                        }
                    }
                });

                resolve(formattedResponse);

            });
        },

        /**
         * Formats the raw league data taken from the database into data that can be sent to the client
         * @param {Object} rawData The raw data from the database
         * @return {Object} Formatted data
         */
        formatLeagueData: function(rawData, summoners) {
            var formatted = []
            rawData.forEach(function(dbElement) {
                summoners.forEach(function(summoner) {
                    if(dbElement.summonerId == summoner.summonerId) {
                        //We do not want to send all the data again, so we create smaller objects to send
                        formatted.push({
                            participantNo: summoner.participantNo,
                            league: dbElement.league,
                            division: dbElement.division,
                            wins: dbElement.wins,
                            losses: dbElement.losses
                        });
                    }
                });
            });
            return formatted;
        },

        /**
         * Formats the raw league data taken from the database into data that can be sent to the client
         * @param {Object} rawData The raw data from the database
         * @return {Object} Formatted data
         */
        formatChampData: function(rawData, summoners) {
            var formatted = [];
            rawData.forEach(function(dbElement) {
                summoners.forEach(function(summoner) {
                    if(dbElement.summonerId == summoner.summonerId) {
                        //We do not want to send all the data again, so we create smaller objects to send
                        formatted.push({
                            participantNo: summoner.participantNo,
                            championWins: dbElement.wins,
                            championName: dbElement.name,
                            championLosses: dbElement.losses,
                            championKills: dbElement.kills,
                            championDeaths: dbElement.deaths,
                            championAssists: dbElement.assists
                        });
                    }
                });
            });
            return formatted;
        },
        
        /**
         * Formats the raw Role data
         * @param {Object} rawData The raw data
         * @param {List<Summoner>} summoners The summoners that are found in the raw data
         * @return {Object} The formatted data
         */
        formatRoleData: function(rawData, summoners) {
            var response = [];
            
            //Each summoner will have a object in the rawdata
            rawData.forEach(function(roleData) {
                var participant = _.find(summoners, function(item) {
                    return item.summonerId == roleData[0].summonerId;
                });

                //Holds our response to the client
                var object = {
                    participantNo: participant.participantNo,
                    roles: []
                };
                
                //Insert into response
                response.push(object);

                //Find the total amount of games
                var totalGames = 0;
                rawData.forEach(function(element) {
                  totalGames += element.games;
                });

                //Create responses
                roleData.forEach(function(element) {

                    //Find percentage
                    var percentage = (element.games * 100) / totalGames;

                    //Find a more suitable type of roles, each different realRole can be created from several unique combinations of lane + role
                    var realRole = Utilities.getRealRole(element.role, element.lane);
                    
                    //Find entry of realRole
                    var existing = _.find(object.roles, function(role) { return role.role === realRole; });
                    if(existing) {
                        existing.games = existing.games + element.games;
                    }
                    else {
                        object.roles.push({
                            role: realRole,
                            games: element.games,
                            percent: isNaN(percentage) ? 0 : percentage.toFixed(1)
                        });
                    }
                });
                
                //Sort the roles in descending order
                object.roles = _.sortBy(object.roles, function(role) { return role.games }).reverse();
            });
            return response;
        },
        
        /**
         * Formats the most played champions data
         * @param {Object} rawData The raw data from the database
         * @param {List<Summoner>} summoners The summoners present in the data
         * @return {Object} The formatted data
         */
        formatMostPlayedChampions: function(rawData, summoners, championData) {
            var response = {};
            
            //Iterate summoners
            summoners.forEach(function(summoner) {
                //Find rows that belong to this summoner
                var rows = _.filter(rawData, function(row) { return row.summonerId == summoner.summonerId; });
                
                //Insert champion image data
                for(var index in rows) {
                    for (var property in championData['data']) {
                        if (championData['data'].hasOwnProperty(property) && championData['data'][property].key == rows[index].championId) {
                            rows[index].championImage = championData['data'][property].image;
                        }
                    }
                }
                
                response[summoner.participantNo] = rows;
            });
            
            return response;
        }
    }
}());

module.exports = DataFormatter;