var Promise = require('bluebird');
    config  = require('../Config/config.js');
    Database= require('../Database/Database.js'),
    RiotAPI = require('../API/RiotAPI.js');

var analysisController = (function() {
    
    function random() {
        
    }
    
    return {
        //Starts the first step in match list data analysis
        //This step only produces data that is to be returned to the client
        //Then queues the rest of the analysis
        initializeMatchListAnalysis: function(summonerId, data) {
            return new Promise(function(resolve, reject) {
                //Insert data into the database
                Database.insertMatches(summonerId, data).then(function(rows) {
                    return db.getRoles(summonerId);
                }).then(function(newData) {
                    resolve(newData);
                    
                    //Log the time of the update
                    Database.logGameUpdate(summonerId);
                    
                    //Insert data into analysis queue
                    //....
                }).catch(function(error) {
                    reject(error);
                });
            });
        }
    }
}());

module.exports = analysisController;