var Promise = require('bluebird');
var config  = require('../Config/config.js');
var Database= require('../db.js');

var analysisController = function(api) {
    var db = Database.getInstance();
    
    function random() {
        
    }
    
    return {
        //Starts the first step in match list data analysis
        //This step only produces data that is to be returned to the client
        //Then queues the rest of the analysis
        initializeMatchListAnalysis: function(summonerId, data) {
            return new Promise(function(resolve, reject) {
                //Insert data into the database
                db.insertMatches(summonerId, data).then(function(rows) {
                    return db.getRoles(summonerId);
                }).then(function(newData) {
                    resolve(newData);
                    
                    //Log the time of the update
                    db.logGameUpdate(summonerId);
                    
                    //Insert data into analysis queue
                    //....
                }).catch(function(error) {
                    reject(error);
                });
            });
        }
    }
}

module.exports = analysisController;