"use strict";
var Promise = require('bluebird'),
    config  = require('../Config/config.js'),
    Database= require('../Database/Database.js'),
    RiotAPI = require('../API/RiotAPI.js');

var analysisController = (function() {

    function getStatisticsForGames(data) {
        if(data['matches'] != undefined) {
            if(data['matches'].length >0) {
                data['matches'].forEach(function(element, index) {
                    RiotAPI.getMatch(element.matchId, element.region, true).then(function(detailed) {
                        return Database.insertDetailedMatch(detailed);

                    }).catch(function(error) {
                        console.log("AnalysisController.getStatisticsForGames: error");
                        console.log(error.stack);
                        return;
                    });
                });
            }
            else {
                console.log("No games to analyze");
            }
        }
    }

    return {
        /**
         * Starts the first step in match list data analysis
         * This step only produces data that is to be returned to the client
         * then queues the rest of the analysis
         */
        initializeMatchListAnalysis: function(summonerId, data) {
            return new Promise(function(resolve, reject) {
                //Insert data into the database
                Database.insertMatches(summonerId, data).catch(function(error) {
                    console.log("error inserting matches");
                    console.log(error);
                    reject(error);

                }).then(function(rows) {
                    return Database.getRoles(summonerId);
                    
                }).then(function(newData) {
                    resolve(newData);
                    //Log the time of the update
                    Database.logGameUpdate(summonerId);
                    
                    //Filter games based on patch
//                    getGameIdsFromCurrentPatch(data);
                    return data;

                }).catch(function(error) {
                    console.log("could not get roles");
                    console.log(error);
                    reject(error);
                
                }).then(function(data) {
                    //Insert data into analysis queue
                    getStatisticsForGames(data);
                });
            });
        }
    }
}());

module.exports = analysisController;