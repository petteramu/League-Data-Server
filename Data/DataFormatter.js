"use strict";

var Promise = require('bluebird'),
    _ = require('underscore'),
    Readables = require('../Utils/Readables.js'),
    Summoner = require('../Model/Summoner.js'),
    Utilities = require('../Utils/utilities.js'),
    RiotAPI = require('../API/RiotAPI.js');

var DataFormatter = (function() {
    
    /**
     * Counts the amount of masteries present in each tree(Offense, Defense, Utility)
     * @param {Object} masteries The list of masteries to count
     * @param {Object} masteryData The mastery data gathered from ddragon
     * @return {Object} An object containing the count for each tree
     */
    function countMasteries(masteries, masteryData) {
        //Insert to blue team
        var obj = {
            offense: 0,
            defense: 0,
            utility: 0
        }

        /* The trees representing the masteries contain each level as
         * as an own list of masteries. Therefore we simplify the process
         * by concatenating these lists so we get one big one for each tree */
        var offTree = [].concat.apply([], masteryData.tree.Offense);
        var defTree = [].concat.apply([], masteryData.tree.Defense);
        var utiTree = [].concat.apply([], masteryData.tree.Utility);
        
        //Iterate masteries
        masteries.forEach(function(mastery) {
            //If the mastery is in the offense tree
            //Some of the positions in the trees are empty, and are therefore represented as null, skip these element
            if(_.find(offTree, function(element) { if(element) { return element.masteryId == mastery.masteryId } else { return false } })) {
                //Increase the offense count by the rank of the mastery
                obj.offense += mastery.rank;
            }
            //Defense tree
            else if(_.find(defTree, function(element) { if(element) { return element.masteryId == mastery.masteryId } else { return false } })) {
                obj.defense += mastery.rank;
            }
            //Can now only be in the utility tree
            else {
                obj.utility += mastery.rank;
            }
        });
        
        return obj;
    }
    
    /**
     * Inserts descriptions and rune image information from the ddragon data
     * @param {Object} player
     * @param {Object} runeData The rune data from ddragon
     */
    function insertRuneInformation(player, runeData) {
        //Iterate runes
        player.runes.forEach(function(rune) {
            //Find rune in runeData
            if(runeData.data.hasOwnProperty(rune.runeId)) {
                rune.description = runeData.data[rune.runeId].description;
                rune.image = runeData.data[rune.runeId].image;
            }
        });
    }
    
    /**
     * Insert information on the summonerspell, such as descprition and flash
     * @param {Object} player
     * @param {Object} summonerObject The object to inject the information into
     */
    function insertSummonerSpellInformation(player, summonerObject) {
        //Check if the summoner spell data has been downloaded during initialization
        //Do not try again as we should not try for every player in every game
        if(RiotAPI.staticData.summonerSpells) {
            var ssData = RiotAPI.staticData.summonerSpells;
            for (var property in ssData['data']) {
                if (ssData['data'].hasOwnProperty(property) && ssData['data'][property].key == player.spell1Id) {
                    summonerObject.summonerSpell1 = {
                        image: ssData['data'][property].image,
                        name: ssData['data'][property].name
                    }
                }
                else if (ssData['data'].hasOwnProperty(property) && ssData['data'][property].key == player.spell2Id) {
                    summonerObject.summonerSpell2 = {
                        image: ssData['data'][property].image,
                        name: ssData['data'][property].name
                    }
                }
            }
        }
    }
    
    return {
        /**
         * Formats the core data into a better structure with only the needed information
         * @param {Object} coreData The raw core data
         * @param {String} region
         */
        formatCoreData: function(coreData, championData, runeData, masteryData, region, version) {
            return new Promise(function(resolve, reject) {
                var formattedResponse = {
                    type: "core",
                    blueTeam: [],
                    redTeam:  [],
                    version: version,
                    queue: Readables.readableQueues[coreData.gameQueueConfigId],
                    map: Readables.readableMaps[coreData.mapId],
                    region: region,
                    gameStartTime: coreData.gameStartTime,
                    gameLength: coreData.gameLength,
                };

                //Create the formatted participant objects
                coreData['participants'].forEach(function(element) {
                    //The first 5 in the list from the API is on blue(100) team, the next are on the purple(200)
                    //The participant number goes from 101-105 and 201 to 205
                    //The length of the team in the formatted response is used to create the participant numbers
                    var pNo = (element.teamId === 100) ? element.teamId + formattedResponse.blueTeam.length + 1 : element.teamId + formattedResponse.redTeam.length + 1;

                    var summonerObject = new Summoner(element.summonerId, element.summonerName, pNo, element.championId, element.teamId, element.runes, region);

                    //Insert mastery data
                    summonerObject.masteries = countMasteries(element.masteries, masteryData);
                    
                    //Insert rune description and image information
                    insertRuneInformation(element, runeData);
                    
                    //Insert summoner spell description and image
                    insertSummonerSpellInformation(element, summonerObject);

                    //Insert into the correct list
                    if(element.teamId === 100) {
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

                //Find the total amount of games for this summoner
                var totalGames = 0;
                roleData.forEach(function(element) {
                  totalGames += element.games;
                });
                
                //Insert into response
                response.push(object);

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