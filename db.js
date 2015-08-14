"use strict";
var mysql  = require('promise-mysql');

//TODO: fix database to contain only averages, as the total amount of deaths is not provided from the Riot API, and therefore the total amount derived will be wrong as the numbers might be rounded
//TODO: handle the league request to handle a 404 return(of none of the playes are ranked)
var Database = (function()
{
    //Stores the instance of the database
    var instance, connection;
    
    //Self executing
    function init() {
        
        //Initialize mysql connection
        mysql.createConnection({
            host     : 'localhost',
            user     : 'root',
            password : '',
            database : 'petteramu_com',
            debug: false
        }).then(function(conn) {
            connection = conn;
        });
        
        //Everything inside is public
        return {
            getSummonerLeagueData: function(gameData) {
                return new Promise(function(resolve, reject) {
                    //Create query
                    var query = "SELECT * FROM summoner_league WHERE (";
                    //Add each player to the query
                    for(var i = 0; i < gameData.pairs.length; i++) {
                        if(i > 0)
                            query += " OR ";
                        query += "summonerId = " + gameData.pairs[i].summonerId;
                    }
                    //Add queuetype
                    query += ") AND queueType = '" + gameData.gameType + "'";

                    //Perform query
                    connection.query(query).then(function(rows) {
                        resolve(rows);
                    }).catch(function(error) {
                        reject(error);
                    });
                });
            },
            
            //Returns statistics on how a player does on a champions
            getSummonerChampData: function(gameData) {
                return new Promise(function(resolve, reject) {
                    //Create query
                    var query = "SELECT * FROM summoner_champ_stats s";
                    //Join with the champion db
                    query += " LEFT JOIN champion c ON(c.championId = s.championId)\
                        WHERE ";
                    
                    //Add each summoner to the query
                    for(var i = 0; i < gameData.pairs.length; i++) {
                        if(i > 0)
                            query += " OR ";
                        query += "(s.summonerId = " + gameData.pairs[i].summonerId + " AND s.championId = " + gameData.pairs[i].championId + ")";
                    }
                    
                    //Perform query
                    connection.query(query).then(function(rows) {
                        resolve(rows);
                    }).catch(function(error) {
                        reject(error);
                    });
                });
            },
            
            getSummonerMostPlayed: function(gameData, amount) {
                return new Promise(function(resolve, reject) {
                    //Create query
                    var query = "SELECT * FROM(";
                    var i;
                    
                    //Add each player to the subquery
                    for(i = 0; i < gameData['pairs'].length; i++) {
                        query += "(SELECT summonerId, championId, wins, losses, kills, deaths, assists, (wins+losses) as games\
                            FROM summoner_champ_stats champion_averages_stats\
                            WHERE summonerId = " + gameData['pairs'][i].summonerId + " and championId != 0\
                            ORDER BY games DESC\
                            LIMIT 5)";
                        //Add union if not the last iteration
                        if(i < gameData['pairs'].length-1) {
                            query += "UNION ALL";
                        }
                    }
                    //End query
                    query += ") s \
                    JOIN champion c ON s.championId = c.championId";

                    //Perform query
                    connection.query(query).then(function(rows) {
                        resolve(rows);
                    }).catch(function(error) {
                        reject(error);
                    });
                });
            },
            
            getChampionAverages: function(gameData) {
                return new Promise(function(resolve, reject) {
                    //Create query
                    var query = "SELECT * FROM champion_averages_stats WHERE ";
                    for(var i = 0; i < gameData.pairs.length; i++) {
                        if(i > 0)
                            query += " OR ";
                        query += "championId = " + gameData.pairs[i].championId;
                    }

                    //Perform query
                    connection.query(query).then(function(rows) {
                        resolve(rows);
                    }).catch(function(error) {
                        reject(error);
                    });
                });
            },
            
            //Updates the data in the database
            //Uses the data from the RiotAPI unchanged
            updateChampData: function(data) {
                return new Promise(function(resolve, reject) {
                    //Create query
                    if(typeof data !== 'undefined' && typeof data['champions'] !== 'undefined') {
                        var query = "INSERT INTO summoner_champ_stats (summonerId, championId, wins, losses, kills, deaths, assists) VALUES";
                    //Add stats to query

                        for(var ii = 0; ii < data['champions'].length; ii++) {
                            var element = data['champions'][ii];

                            //Add divider if previous statement does not return error
                            if(ii > 0)
                                query += ", ";

                            //Add statistiscs
                            query += " ('" + data['summonerId'] + "', '" + element['id'] + "', '" + element['stats']['totalSessionsWon'] + "', '" + element['stats']['totalSessionsLost'] + "', '" + element['stats']['totalChampionKills'] + "', '" + element['stats']['totalDeathsPerSession'] + "', '" + element['stats']['totalAssists'] + "')";
                        }

                        //Add update on duplicate
                        query += " ON DUPLICATE KEY UPDATE summonerId=VALUES(summonerId), championId=VALUES(championId), wins=VALUES(wins), losses=VALUES(losses), kills=VALUES(kills),  deaths=VALUES(deaths), assists=VALUES(assists)";
                        
                        //Perform query
                        connection.query(query).then(function(rows) {
                            resolve(rows);
                        }).catch(function(error) {
                            reject(error);
                        });
                    }
                });
            },
                
            //Updates the league data
            updateLeagueData: function(data) {
                return new Promise(function(resolve, reject) {
                    //Create query
                    var query = "INSERT INTO summoner_league (summonerId, queueType, league, division, points, wins, losses) VALUES";

                    var added = 0; //Keeps track of how many rows are added to the query, as 'i' does not fulfull this if the summoner was not present in the data from the API
                    for(var property in data) {
                        if(data.hasOwnProperty(property)) {
                           var element = data[property];
                            
                            if(added > 0) //Add divider
                                query += ", ";

                            for(var ii = 0; ii < element.length; ii++) {
                                if(ii > 0)
                                    query += ", ";
                                query += " ('" + property + "', '" + element[ii]['queue'] + "', '" + element[ii]['tier'] + "', '" + element[ii]['entries'][0]['division'] + "', '" + element[ii]['entries'][0]['leaguePoints'] + "', '" + element[ii]['entries'][0]['wins'] + "', '" + element[ii]['entries'][0]['losses'] + "')";
                            }
                            added++; //If we reach this point, the row has been added to the query
                        }
                    }

                    query += " ON DUPLICATE KEY UPDATE summonerId=VALUES(summonerId), queueType=VALUES(queueType), league=VALUES(league), division=VALUES(division), points=VALUES(points),  wins=VALUES(wins),  losses=VALUES(losses)";


                    //Do not attempt to insert into the database if none of the players have any league data
                    if(added == 0) {
                        //But treat it as a success(as it was updated but none has any data)
                        resolve();
                    }
                    else {
                        //If the data from the api contains data on at least one player, insert into db
                        //Perform query
                        connection.query(query).then(function(rows) {
                            resolve(rows);
                        }).catch(function(error) {
                            reject(error);
                        });
                    }
                });
            }
        }
    };
    
    return {
        getInstance: function () {
            if(!instance) {
                instance = init();
            }
            
            return instance;
        }
    };
        
})();

module.exports = Database;