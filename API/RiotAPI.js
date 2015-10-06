"use strict";

var req = require("request-promise"),
    errors = require('request-promise/errors'),
    url = require('url'),
    Promise = require('bluebird'),
    config = require('./config.js');

var RiotAPI = (function() {
    //Holds the static data that are downloaded for future re-use
    var staticData = {};
    
    var debug = false;
    
    //Https or http
    var secure = true;
    
    //The standard host
    var host = 'euw.api.pvp.net';
    
    //The path in global
    var globalPath = 'global.api.pvp.net';
    
    //Path, used to create urls
    var localPath ='/api/lol/';
    
    //API key
    var key = config.apiKey;
    
    //The queue that holds the requests
    var queue = [];
    
    //Queue that holds promises that are needed by the AnalysisController
    //Is only executed when the original queue is empty
    var analysisQueue = [];
    
    //Whether or not the queue is being executed
    var executing = false;
    
    //Non-static cache
    var cache = {};
    
    //The time that is forced between two calls
    //Mainly used to account for the time taken between adding a stamp and the actual call being made in the riot db
    var forcedTimeBetweenCalls = 75;
    
    //A reference to whether or not the API is waiting for a request to finish
    var waiting = false;
    
    //Rate limit functions
    //Array holding the timestamps of recently made requests
    var timestamps = [];
    
    //Rate limits
    var limits = [{
        maxCalls: 10,
        maxTime: 10
    }, {
        maxCalls: 500,
        maxTime: 600
    }];
    
    //Find the largest maxCalls and set it to limit the amount of timestamps
    var timestampLimit = 0;
    for(var i = 0; i < limits.length; i++) {
        if(limits[i].maxCalls > timestampLimit)
            timestampLimit = limits[i].maxCalls;
    };
    
    //Finds the time remaining for either the limit per 10min or 10s, dependent on which is longer
    var getTimeRemaining = function() {
        debugger;
        var remaining = []; //Array holding the different values for the time remaining
        
        //Iterate each limit and find the time remaining for each
        for(var i = 0; i < limits.length; i++) {
            var limitObj = limits[i];
            
            if(timestamps.length >= limitObj.maxCalls) {
                remaining.push((limitObj.maxTime * 1000) - (new Date() - timestamps[limitObj.maxCalls-1]) + forcedTimeBetweenCalls); //In milliseconds

            } else {
                remaining.push(0);
            }
        };
        
        return Math.max.apply(Math, remaining);
    }
    
    //Adds a timestamp
    var addStamp = function(timestamp) {
        //Remove if at max calls
        if(timestamps.length == timestampLimit) timestamps.pop();
        
        //Increase the delay a little
        var newDate = new Date(timestamp);
        
        //Insert at the start
        timestamps.unshift(newDate);
    }
            
    //Adds a url to the request queue and start executing the queue if its not already executing
    var addToQueue = function(url, cb) {
        //Create queueitem
        var item = {
            url: url,
            callback: cb
        };
        
        //Insert element
        queue.push(item);
        
        //Execute queue if the new promise is the only one in it
        if(!executing) executeNext();
    };
    
    //Gets the next item in the queue of null
    var getNextItem = function() {
        //If the queue is not empty return an item
        if(queue.length > 0) return queue.pop();
        //If it is empty return null    
        else return null;
    }

    //Execute the next item in the queue
    var executeNext = function() {
        //Do not execute another if there is a request in the waiting
        //This forces the queue to only execute one reques at a time
        if(waiting) return;
        
        //Set that the API is executing a request
        executing = true;
        
        //Get next item
        var item = getNextItem();
        
        //Only execute if the queue is not empty
        if(item === null) {
            //No longer executing
            executing = false;
            return;
        }
        
        //Check if the rate limit is reached
        var timeRemaining = getTimeRemaining();
        
        //Display debug info
        if(timeRemaining > 0) {
//            console.log("Waiting: %s", timeRemaining);
            waiting = true;
        }
        
        //Run again after a delay
        setTimeout(function() {
            waiting = false;
            makeRequest(item.url, item.callback);
        }, timeRemaining);
    }
    
    //Makes an actual request
    var makeRequest = function(url, cb) {
        
        //Display debug info it is wished
        if (debug){
            console.log('Calling url', url);
        }

        //Create options object
        var options = {
            uri: url,
            method: 'GET'
        };
        
        addStamp(new Date());
        req.get(options).then(function(data) {
            
            //Return as JSON if it is in json format
            try {
                var json = JSON.parse(data);
                //Run the callback
                cb(null, json);
            }
            //Return as normal data if its not JSON
            catch(e) {
                cb(null, data);
            }
            finally {
                //Proceed in the queue
                executeNext();
            }
            
        }).catch(errors.StatusCodeError, function(error) {
            //Reject
            cb(error);
            console.log(error.statusCode);
            //Proceed in the queue
            executeNext();
            
        }).catch(errors.RequestError, function(error) {
            //Reject
            cb(error);
            console.log(error.stack);
            
            //Proceed in the queue
            executeNext();
            
        });
    }
    
    //Creates the url of the request
    var generateUrl = function(options) {
        if(options && options.query){
            options.query.api_key = key;
        } else {
            options.query = {api_key: key};
        }
        
        var result;
        if(options.observer != undefined && options.observer == true) {
            result = url.format({
                protocol: (secure) ? 'https:' : 'http:',
                host: host + options.path,
                query: options.query
            });
        }
        else if(options.global) {
            result = url.format({
                protocol: (secure) ? 'https:' : 'http:',
                host: globalPath + localPath + options.path,
                query: options.query
            });
        }
        else if(options.static) {
            result = url.format({
                protocol: (secure) ? 'https:' : 'http:',
                host: globalPath + localPath + "static-data/" + options.region + options.path,
                query: options.query
            });
        }
        else {
            result = url.format({
                protocol: (secure) ? 'https:' : 'http:',
                host: host + localPath +  options.region + options.path,
                query: options.query
            });
        }

        return result;

    };
    
    //Creates a promise which adds an url to a queue and resolves when the request has been made
    var createPromise = function(url) {        
        //Create and return promise
        return new Promise(function(resolve, reject) {
            
            addToQueue(url, function(err, data) {
                
                //Handle error
                if(err) {
                    reject(err);
                }
                //No error = resolve
                else {
                    resolve(data);
                }
            });
        });
    }
    
    ////////////
    //From here down the api's endpoints are listed
    ////////////
    
    //Gets the current version of lol. Notice: not the version of the API
    var getCurrentVersion = function(region) {    
        //Create url
        var url = generateUrl({
            region: region,
            global: true,
            path: 'static-data/' + region +'/v1.2/versions/'
        });
        
        //Create and return the promise
        return new Promise(function(resolve, reject) {
            //We can call this method directly since its a static endpoint and it does not count towards the rate limit
            makeRequest(url, function(err, data) {
                //Handle errors
                if(err) {
                    reject(err);
                    return;
                }
                //Store in staticData object for future use
                staticData['version'] = data[0];
                console.log(data[0]);
                //Resolve promise
                resolve(data);
            });
        });
    };
    
    //The match list endpoint of the API
    //Returns a set of matches(API forces a maximum of 20)
    var getMatchList = function(region, summonerId, championIds, rankedQueues, seasons, beginTime, endTime, beginIndex, endIndex) {
        var query = {};
        if(region) query.region = region;
        if(summonerId) query.summonerId = summonerId;
        if(championIds) query.championIds = championIds;
        if(rankedQueues) query.rankedQueues = rankedQueues;
        if(seasons) query.seasons = seasons;
        if(beginTime) query.beginTime = beginTime;
        if(endTime) query.endTime = endTime;
        if(beginIndex) query.beginIndex = beginIndex;
        if(endIndex) query.endIndex = endIndex;
        
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v2.2/matchlist/by-summoner/' + summonerId,
            query: query
        });
        
        return createPromise(url);
    }
    
    //Gets the current game data for a summoner
    var getCurrentGame = function(region, summonerId) {
        //Create url
        var url = generateUrl({
            region: region,
            //Is from the observer endpoints
            observer: true,
            path: '/observer-mode/rest/consumer/getSpectatorGameInfo/' + platforms[region] + '/' + summonerId
        });
        
        return createPromise(url);
    };
    
    //Gets a list of featured games
    var getFeaturedGames = function(region) {
        //Create url
        var url = generateUrl({
            region: region,
            //Is from the observer endpoints
            observer: true,
            path: '/observer-mode/rest/featured'
        });
        
        return createPromise(url);
    };
    
    //Gets the recent games by a summoner(any type)
    var getRecentGamesBySummonerId = function(region, summonerId) {
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v1.3/game/by-summoner/' + summonerId + '/recent'
        });
        return createPromise(url);
    };
    
    //Gets the champion data
    var getChampionsData = function(region, freeToPlay) {
        //Create url
        var ftp = Boolean(freeToPlay) || false;
        var url = generateUrl({
            region: region,
            path: '/v1.2/champion',
            static: true,
            query: {
                champData: 'info',
                freeToPlay: ftp
            }
        });
        
        return createPromise(url);
    };
    
    //Gets the leagues of a summoner(all players in that league)
    var getLeagueBySummonerId = function(region, summonerId) {
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v2.5/league/by-summoner/' + summonerId
        });
        
        return createPromise(url);
    };
    
    //Gets the leagues entries of a summoner
    var getLeagueEntryBySummonerId = function(region, summonerId) {
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v2.5/league/by-summoner/' + summonerId + '/entry'
        });
        
        return createPromise(url);
    };
    
    //Gets the challenger leagues in a type of game
    var getChallengerLeagueByGametype = function(region, type) {
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v2.5/league/challenger',
            query: {
                type: type
            }
        });
        
        return createPromise(url);
    };
    
    //Gets the summary stats of a summoner
    var getSummaryStatsBySummonerId = function(region, summonerId, season) {

        var query = {};

        if(season){
            query.season = season;
        }
        
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v1.3/stats/by-summoner/' + summonerId + '/summary',
            query: query
        });
        
        return createPromise(url);
    };
    
    //Gets the leagues entries of a summoner
    var getRankedStatsBySummonerId = function(region, summonerId, season) {

        var query = {};

        if(season){
            query.season = season;
        }

        //Create url
        var url = generateUrl({
            region: region,
            path: '/v1.3/stats/by-summoner/' + summonerId + '/ranked',
            query: query
        });
        
        return createPromise(url);
    };
    
    //Gets the challenger leagues in a type of game
    var getMasteriesBySummonerId = function(region, summonerId) {
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v1.4/summoner/' + summonerId + '/masteries'
        });

        return createPromise(url);
    };
    
    //Gets the challenger leagues in a type of game
    var getRunesBySummonerId = function(region, summonerId) {
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v1.4/summoner/' + summonerId + '/runes'
        });

        return createPromise(url);
    };

    //Gets info on a summoner based on his/her name
    var getSummonerByName = function(region, name){
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v1.4/summoner/by-name/' + name
        });

        return createPromise(url);
    };


    //Gets info on a summoner based on his/her id
    var getSummonerBySummonerId = function(region, summonerId){
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v1.4/summoner/' + summonerId
        });

        return createPromise(url);
    };


    //Gets info on a summoner based on his/her id
    var getTeamsBySummonerId = function(region, summonerId){
        //Create url
        var url = generateUrl({
            region: region,
            path: '/v2.2/team/by-summoner/' + summonerId
        });

        return createPromise(url);
    };
    
    //DDragon static data
    
    //Realms
    var getRealms = function(region, cb) {
        return new Promise(function(resolve, reject) {
            if(staticData.realms) {
                resolve(staticData.realms);
                return;
            }

            var url = 'http://ddragon.leagueoflegends.com/realms/' + region + '.json';

            makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    staticData.realms = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Runes
    var getRunes = function(version, locale) {
        return new Promise(function(resolve, reject) {
            //If the data exists in the static data object
            if(staticData.runes) {
                //Return that data instead
                resolve(staticData.runes);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/rune.json';

            makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    staticData.runes = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Masteries
    var getMasteries = function(version, locale) {
        return new Promise(function(resolve, reject) {
            if(staticData.masteries) {
                resolve(staticData.masteries);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/mastery.json';

            makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    staticData.masteries = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Champions
    var getChampions = function(data, locale) {
        return new Promise(function(resolve, reject) {
            if(staticData.champions) {
                resolve(staticData.champions);
                return;
            }
            
            var version = staticData.version;

            var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/champion.json';

            makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    staticData.champions = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Summoner spells
    var getSummonerSpells = function(version, locale) {
        return new Promise(function(resolve, reject) {
            if(staticData.summonerspells) {
                resolve(staticData.summonerspells);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/summoner.json';

            makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    staticData.summonerspells = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Summoner spells
    var getItems = function(version, locale) {
        return new Promise(function(resolve, reject) {
            if(staticData.items) {
                resolve(staticData.items);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/item.json';

            makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    staticData.items = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Summoner spells
    var getLanguage = function(version, locale) {
        return new Promise(function(resolve, reject) {
            if(staticData.language) {
                resolve(staticData.language);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/language.json';

            makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    staticData.language = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Data
    var regions = {
        'euw': 'Europe West',
        'eune': 'Europe Nordic and East',
        'na': 'North America',
        'br': 'Brazil',
        'oce': 'Oceania',
        'ru': 'Russia',
        'tr': 'Turkish',
        'lan': 'Latin America North',
        'las': 'Latin America South',
        'kr': 'Republic of Korea',
        'pbe': 'Public Beta Environment'
    };

    var readableQueues = {
        2: 'Normal 5v5 Blind Pick',
        4: 'Ranked Solo 5v5',
        7: 'Coop vs AI 5v5',
        8: 'Normal 3v3',
        14:	'Normal 5v5 Draft Pick',
        16:	'Dominion 5v5 Blind Pick',
        17:	'Dominion 5v5 Draft Pick',
        25: 'Dominion Coop vs AI',
        41:	'Ranked Team 3v3',
        42:	'Ranked Team 5v5',
        52:	'Twisted Treeline Coop vs AI',
        65:	'ARAM',
        67:	'ARAM Coop vs AI',
        72:	'Snowdown Showdown 1v1',
        73:	'Snowdown Showdown 2v2'
    };

    var queues = {
        2: 'Normal 5v5 Blind Pick',
        4: 'RANKED_SOLO_5X5',
        7: 'Coop vs AI 5v5',
        8: 'Normal 3v3',
        14:	'Normal 5v5 Draft Pick',
        16:	'Dominion 5v5 Blind Pick',
        17:	'Dominion 5v5 Draft Pick',
        25: 'Dominion Coop vs AI',
        41:	'RANKED_TEAM_3v3',
        42:	'RANKED_TEAM_5v5',
        52:	'Twisted Treeline Coop vs AI',
        65:	'ARAM',
        67:	'ARAM Coop vs AI',
        72:	'Snowdown Showdown 1v1',
        73:	'Snowdown Showdown 2v2'
    };

    var gametypes = {
        'CUSTOM_GAME': 'Custom game',
        'MATCHED_GAME':	'Matched game',
        'CO_OP_VS_AI_GAME': 'Bot game',
        'TUTORIAL_GAME': 'Tutorial game',
        'RANKED_SOLO_5x5': 'Ranked SoloQ',
        'RANKED_TEAM_5x5': 'Ranked Team 5v5',
        'RANKED_TEAM_3x3': 'Ranked Team 3v3'
    };

    var gamemode = {
        'CLASSIC': 'Summoner\'s Rift/Twisted Treeline game',
        'ODIN': 'Dominion/Crystal Scar game',
        'ARAM':	'ARAM/Howling Abyss game',
        'TUTORIAL':	'Tutorial game'
    };
    
    var readableMaps = {
        '1':  "Original Summoner's Rift",
        '10': "Current Twisted Treeline",
        '11': "Summoner's Rift",
        '12': "Howling Abyss"
    };

    var platforms = {
        br: 'BR1',
        eune: 'EUN1',
        euw: 'EUW1',
        kr: 'KR',
        lan: 'LA1',
        las: 'LA1',
        na: 'NA1',
        oce: 'OC1',
        tr: 'TR1',
        ru: 'RU',
        pbe: 'PBE1'
    };
    
    //Initialize
    console.log("initializing");
    //Get the version upon creation
    getCurrentVersion('euw').catch(function(error) {
        console.log("Failed to load current version: %s", error);
    });
    
    return {
        //Static-data cache
        staticData: staticData,
        
        //Readable data
        platforms: platforms,
        readableMaps: readableMaps,
        gamemode: gamemode,
        gametypes: gametypes,
        queues: queues,
        regions: regions,
        readableQueues: readableQueues,
        
        //Static data(ddragon api)
        getCurrentVersion: getCurrentVersion,
        getLanguage: getLanguage,
        getItems: getItems,
        getSummonerSpells: getSummonerSpells,
        getMasteries: getMasteries,
        getRunes: getRunes,
        getChampions: getChampions,
        
        //Endpoints
        getTeamsBySummonerId: getTeamsBySummonerId,
        getSummonerBySummonerId: getSummonerBySummonerId,
        getSummonerByName: getSummonerByName,
        getRunesBySummonerId: getRunesBySummonerId,
        getMasteriesBySummonerId: getMasteriesBySummonerId,
        getRankedStatsBySummonerId: getRankedStatsBySummonerId,
        getSummaryStatsBySummonerId: getSummaryStatsBySummonerId,
        getChallengerLeagueByGametype: getChallengerLeagueByGametype,
        getLeagueEntryBySummonerId: getLeagueEntryBySummonerId,
        getRecentGamesBySummonerId: getRecentGamesBySummonerId,
        getFeaturedGames: getFeaturedGames,
        getCurrentGame: getCurrentGame,
        getChampionsData: getChampionsData,
        getMatchList: getMatchList
    };
}());

module.exports = RiotAPI;