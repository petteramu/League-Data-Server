"use strict";
var mysql  = require('promise-mysql'),
    Promise = require('bluebird'),
    DatabaseCredentials = require('./DatabaseCredentials.js'),
    UserNotFoundError = require('../Errors/UserNotFoundError.js'),
    InternalServerError = require('../Errors/InternalServerError.js'),
    Config = require('../Config/config.js');

//TODO: fix database to contain only averages, as the total amount of deaths is not provided from the Riot API, and therefore the total amount derived will be wrong as the numbers might be rounded
//TODO: handle the league request to handle a 404 return(of none of the playes are ranked)
var Database = (function()
{
    //Stores the instance of the database
    var instance, connection;
        
    //Initialize mysql connection
    mysql.createConnection({
        host     : DatabaseCredentials.host || 'localhost',
        port     : DatabaseCredentials.port || '3306',
        user     : DatabaseCredentials.user || 'root',
        password : DatabaseCredentials.password || '',
        database : DatabaseCredentials.database,
        debug: false
    }).then(function(conn) {
        connection = conn;
    }).catch(function(error) {
        console.log(error);
    });

    //Everything inside is public
    return {
        /**
         * Gets the league information on a list of summoners
         * @param {List} summoners
         */
        getSummonerLeagueData: function(summoners, queueType) {
            return new Promise(function(resolve, reject) {
                //Create query
                var query = "SELECT * FROM summoner_league WHERE (";
                //Add each player to the query
                for(var i = 0; i < summoners.length; i++) {
                    if(i > 0)
                        query += " OR ";
                    query += "summonerId = " + summoners[i].summonerId;
                }
                //Add queuetype
                query += ") AND queueType = '" + queueType + "'";
                
                //Perform query
                connection.query(query).then(function(rows) {
                    resolve(rows);
                }).catch(function(error) {
                    reject(error);
                });
            });
        },

        //Returns statistics on how a player does on a champions
        getSummonerChampData: function(summoners) {
            return new Promise(function(resolve, reject) {
                //Create query
                var query = "SELECT * FROM summoner_champ_stats s";
                //Join with the champion db
                query += " LEFT JOIN champion c ON(c.championId = s.championId)\
                    WHERE ";

                //Add each summoner to the query
                for(var i = 0; i < summoners.length; i++) {
                    if(i > 0)
                        query += " OR ";
                    query += "(s.summonerId = " + summoners[i].summonerId + " AND s.championId = " + summoners[i].championId + ")";
                }
                
                //Perform query
                connection.query(query).then(function(rows) {
                    resolve(rows);
                }).catch(function(error) {
                    reject(error);
                });
            });
        },

        /**
         * Fetches a list of summoners most played champions
         * Will have rows with summonerId | championId | wins | losses | kills | deaths | assists | games | championId | name
         * @param {List<Summoners>} summoners
         * @param {Integer} amount The amount of most played champions
         * @return {Promise} A Promise that resolves with the rows
         */
        getSummonerMostPlayed: function(summoners, amount) {
            return new Promise(function(resolve, reject) {
                //Create query
                var query = "SELECT * FROM(";
                var i;

                //Add each player to the subquery
                for(i = 0; i < summoners.length; i++) {
                    query += "(SELECT summonerId, championId, wins, losses, kills, deaths, assists, (wins+losses) as games\
                        FROM summoner_champ_stats\
                        WHERE summonerId = " + summoners[i].summonerId + " and championId != 0\
                        ORDER BY games DESC\
                        LIMIT " + amount + ")";
                    //Add union if not the last iteration
                    if(i < summoners.length-1) {
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

        //Inserts new data into the summoner_champ_stats table, which represents how a player performes on a specific champion
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
        },

        insertMatches: function(summonerId, data) {
            return new Promise(function(resolve, reject) {
                var sql = "INSERT IGNORE INTO game (gameId, gameCreation, queueType, season, platformId) VALUES";
                var participantSql = "INSERT IGNORE INTO participant (gameId, summonerId, championId, lane, role) VALUES";

                if(data['matches'] === undefined) {
                    resolve(0);
                    return;
                }

                data['matches'].forEach(function(element, index) {
                    //Insert the data into the SQL

                    //Do not include an "and" in the first element
                    if(index > 0) {
                        sql += " ,";
                        participantSql += " ,";
                    }

                    sql += " ('" + element.matchId + "', '" + element.timestamp + "', '" + element.queue + "', '" + element.season + "', '" + element.platformId + "')";
                    participantSql += " ('" + element.matchId + "', '" + summonerId + "', '" + element.champion + "', '" + element.lane + "', '" + element.role + "')";
                });

                //Perform query
                connection.query(sql).then(function(rows) {
                    return connection.query(participantSql);
                }).then(function(rows) {
                    resolve(rows);
                }).catch(function(error) {
                    console.log("error when inserting matches");
                    reject(error);
                });
            });
        },

        insertDetailedMatch: function(data) {
            return new Promise(function(resolve, reject) {
                var sql = "INSERT IGNORE INTO game (gameId, mapId, gameMode, gameType, gameVersion, gameDuration) VALUES";
                var participantSql = "INSERT INTO participant (gameId, summonerId, teamId, kills, deaths, assists, winner, spell1Id, spell2Id) VALUES";

                var statsSql = "INSERT INTO participant_stats (gameId, summonerId, champLevel, doubleKills, tripleKills,\
                 quadraKills, pentaKills, unrealKills, killingSprees, largestKillingSpree, largestCriticalStrike, totalDamageDealt,\
                  totalDamageDealtToChampions, totalDamageTaken, physicalDamageDealt, physicalDamageDealtToChampions, physicalDamageTaken,\
                   magicDamageDealt, magicDamageDealtToChampions, magicDamageTaken, trueDamageDealt, trueDamageDealtToChampions, trueDamageTaken, totalHeal,\
                    sightWardsBought, visionWardsBought, wardsPlaced, wardsKilled, item0,item1, item2, item3, item4, item5, item6, minionsKilled,\
                     firstBloodAssist, firstBloodKill, goldEarned, goldSpent, totalTimeCrowdControlDealt, totalUnitsHealed, neutralMinionsKilled,\
                      neutralMinionsKilledEnemyJungle, neutralMinionsKilledTeamJungle, towerKills, inhibitorKills) VALUES";

                sql += " ('" + data.matchId + "', '" + data.mapId + "', '" + data.matchMode + "', '" + data.matchType + "', '" + data.matchVersion + "', '" + data.matchDuration + "')";
                
                data['participants'].forEach(function(element, index) {
                    //Do not include an "and" in the first element
                    if(index > 0) {
                        statsSql += " ,";
                        participantSql += " ,";
                    }

                    participantSql += " ('" + data.matchId + "', '" + data['participantIdentities'][index].player.summonerId + "', '" + element.teamId + "', '" + element.stats.kills + "', '" + element.stats.deaths 
                     + "', '" + element.stats.assists + "', '" + element.stats.winner + "', '" + element.stats.spell1Id + "', '" + element.stats.spell2Id + "')";

                    statsSql += " ('" + data.matchId + "', '" + data['participantIdentities'][index].player.summonerId + "', '" + element.stats.champLevel + "', '" + element.stats.doubleKills + "', '" + element.stats.tripleKills
                         + "', '" + element.stats.quadraKills + "', '" + element.stats.pentaKills + "', '" + element.stats.unrealKills + "', '" + element.stats.killingSprees + "', '" + element.stats.largestKillingSpree
                          + "', '" + element.stats.largestCriticalStrike + "', '" + element.stats.totalDamageDealt + "', '" + element.stats.totalDamageDealtToChampions + "', '" + element.stats.totalDamageTaken
                           + "', '" + element.stats.physicalDamageDealt + "', '" + element.stats.physicalDamageDealtToChampions + "', '" + element.stats.physicalDamageTaken + "', '" + element.stats.magicDamageDealt
                            + "', '" + element.stats.magicDamageDealtToChampions + "', '" + element.stats.magicDamageTaken + "', '" + element.stats.trueDamageDealt + "', '" + element.stats.trueDamageDealtToChampions
                             + "', '" + element.stats.trueDamageTaken + "', '" + element.stats.totalHeal + "', '" + element.stats.sightWardsBought + "', '" + element.stats.visionWardsBought + "', '" + element.stats.wardsPlaced
                              + "', '" + element.stats.wardsKilled + "', '" + element.stats.item0 + "', '" + element.stats.item1 + "', '" + element.stats.item2 + "', '" + element.stats.item3 + "', '" + element.stats.item4
                               + "', '" + element.stats.item5 + "', '" + element.stats.item6 + "', '" + element.stats.minionsKilled + "', '" + element.stats.firstBloodAssist + "', '" + element.stats.firstBloodKill + "', '" + element.stats.goldEarned
                                + "', '" + element.stats.goldSpent + "', '" + element.stats.totalTimeCrowdControlDealt + "', '" + element.stats.totalUnitsHealed + "', '" + element.stats.neutralMinionsKilled + "', '" + element.stats.neutralMinionsKilledEnemyJungle
                                 + "', '" + element.stats.neutralMinionsKilledTeamJungle + "', '" + element.stats.towerKills + "', '" + element.stats.inhibitorKills + "')";
                });

                sql += " ON DUPLICATE KEY UPDATE mapId=VALUES(mapId), gameMode=VALUES(gameMode), gameType=VALUES(gameType), gameVersion=VALUES(gameVersion), gameDuration=VALUES(gameDuration)";
                participantSql += " ON DUPLICATE KEY UPDATE teamId=VALUES(teamId), deaths=VALUES(deaths), kills=VALUES(kills), assists=VALUES(assists), winner=VALUES(winner), spell1Id=VALUES(spell1Id), spell2Id=VALUES(spell2Id)";
                statsSql += " ON DUPLICATE KEY UPDATE gameId=VALUES(gameId)";

                //Perform query
                connection.query(sql).then(function(rows) {
                    return connection.query(participantSql);
                }).catch(function(error) {
                    console.log("sql query");
                    reject(error);
                }).then(function(rows) {
                    return connection.query(statsSql);
                }).catch(function(error) {
                    console.log("participant query");
                    reject(error);
                }).then(function(rows) {
                    resolve(rows)
                }).catch(function(error) {
                    console.log("stats query");
                    reject(error);
                });

            });
        },

        getRoles: function(summonerId) {
            return new Promise(function(resolve, reject) {
                var sql = "SELECT COUNT(summonerId) as games, summonerId, role, lane FROM `participant` WHERE summonerId = " + summonerId + " GROUP BY role, lane, summonerId";
                
                //Perform query
                connection.query(sql).then(function(rows) {
                    resolve(rows);
                }).catch(function(error) {
                    console.log("rejkected");
                    console.log(error);
                    reject(error);
                });
            });
        },

        logGameUpdate: function(summonerId) {
            connection.query("UPDATE summoner_games_update SET lastUpdate=now()").catch(function(error) {
                console.log(sql);
                console.log(error.stack);
            });
        },

        /*
         * Returns the timestamps of the last update to the games of a 
         * list of summoners
         *
         * @param {List} summonerIds
         */
        getUpdateTimestamps: function(summonerIds) {
            return new Promise(function(resolve, reject) {
                var sql = "SELECT * FROM summoner_games_update WHERE";

                summonerIds.forEach(function(element, index) {
                    //Insert the data into the SQL

                    //Do not include an "and" in the first element
                    if(index > 0) {
                        sql += " OR";
                    }

                    sql += " summonerId = '" + element + "'";
                });

                connection.query(sql).then(function(data) {
                    var response = {};
                    summonerIds.forEach(function(outer) {
                        var found = false;
                        data.forEach(function(inner) {
                            if(outer == inner.summonerId) {
                                response[outer] = inner.lastUpdated;
                                found = true;
                            }
                        });

                        if(!found) {
                            response[outer] = 0;
                        }
                    });

                    resolve(response);
                }).catch(function(error) {
                    console.log(sql);
                    reject(error);
                });
            });
        },

        /*
         * Insert a set of champion information into the database
         * This information contains must contain the name and id of the champion
         * in an object where each champinon is represented as a key
         *
         * @param {Object} data The raw data from
         */
        updateChampionTable: function(data) {
            return new Promise(function(resolve, reject) {
                var sql = "INSERT INTO champion (championId, name) VALUES";

                var i = 0;
                for (var property in data) {
                    if (data.hasOwnProperty(property)) {
                        if(i++ > 0) {
                            sql += " ,";
                        }
                        sql += ' ("' + data[property].id + '", "' + (data[property].name) + '")';
                    }
                }

                sql += " ON DUPLICATE KEY UPDATE championId=VALUES(championId), name=VALUES(name)";

                connection.query(sql).then(function(rows) {
                    resolve(rows);
                }).catch(function(error) {
                    reject(error);
                });
            });
        },
        
        /**
         * Fetches a users row from the database
         * 
         * @param {String} username The email of the user
         * @returns {Promise} Resolving promise with the data if the user is found, if not the promise rejects with a UserNotFoundError
         */
        getUser: function(username) {
            return new Promise(function(resolve, reject) {
                try {
                    /* Use parameterized queries to defend against injection attacks */
                    connection.query("SELECT * FROM user WHERE email = ?", username).then(function(rows) {
                        if(rows.length > 0) {
                            console.log(rows);
                            /* Only resolve with the first row, as it should only be one(enforced by the db) */
                            resolve(rows[0]);
                        }
                        else {
                            reject(new UserNotFoundError("User does not exists"));
                        }
                    }).catch(function(error) {
                        console.log(error);
                        reject(new InternalServerError("SQL syntax error"));
                    });
                }
                catch(err) {
                    reject(err);
                }
            }); 
        },
        
        /*
         * Deletes any series associates with this user
         * @param {Integer} userid
         * @return {Promise} Resolves upon success, rejects on server errors
         */
        deleteSeriesForUser: function(userid) {
            return connection.query("DELETE FROM login_series WHERE userid = ?", userid);
        },
        
        /*
         * Deletes any data about this series
         * @param {Integer} userid
         * @return {Promise} Resolves upon success, rejects on server errors
         */
        deleteSeries: function(series) {
            return connection.query("DELETE FROM login_series WHERE series = ?", series);
        },
        
        /*
         * Registers a pair of access and refresh tokens in the database
         * @param {Integer} userid
         * @param {String} access_token
         * @param {String} refresh_token
         * @param {Date} created The time the tokens were created
         * @param {Date} expiryDate The time these tokens expires
         * @param {Promise} Will resolve if both are inserted successfully and reject otherwise
         */
        createNewLoginSeries: function(userid, series, token) {
            console.log(expiryDate);
            return new Promise(function(resolve, reject) {
                connection.query("INSERT INTO login_series VALUES(?, ?, ?, now() + INTERVAL " + Config.accessTokenExpiry + " HOURS)", [userid, series, token]).then(function(rows) {
                    resolve(rows);
                    
                }).catch(function(error) {
                    console.log(error);
                    reject(new InternalServerError(error));
                });
                                 
             });
        },
        
        /* 
         * Checks if the given access token is registered in the databse
         * @param {String} token
         */
        accessTokenExists: function(token) {
            return new Promise(function(resolve, reject) {
                connection.query("SELECT token FROM access_tokens WHERE token = ?", token).then(function(rows) {
                    if(rows.length > 0) {
                        resolve(true);
                    }
                    else {
                        resolve(false);
                    }
                }).catch(function(error) {
                    reject(error);
                });
            });
        },
        
        /* Returns all the data from the access token table for the given token
         * @param {String} token
         */
        getLoginSeriesData: function(token) {
            return new Promise(function(resolve, reject) {
                connection.query("SELECT * FROM login_series WHERE series = ? AND token = ?", [series, token]).then(function(rows) {
                    if(rows.length > 0) {
                        resolve(rows[0]);
                    }
                    else {
                        reject();
                    }
                }).catch(function(error) {
                    reject(error);
                });
            });
        }
    }
        
})();

module.exports = Database;