"use strict";

var req = require("request-promise");
var errors = require('request-promise/errors');
var url = require('url');

var RiotAPI = function(settings) {
    this.debug  = settings.debug  || false;
    
    //Https or http
    this.secure = settings.secure || false;
    
    //The standard host
    this.host   = settings.host   || 'euw.api.pvp.net';
    
    //The path in global
    this.globalPath = settings.globalPath || 'global.api.pvp.net';
    
    //Path, used to create urls
    this.localPath  = settings.localPath || '/api/lol/';
    
    //API key
    this.key   = settings.key || '586229bd-69d8-4be3-accf-701a8346822c';
    
    //The queue that holds the requests
    this.queue = [];
    
    //Whether or not the queue is being executed
    this.executing = false;
    
    //Create timestampHandler and use default settings
    var tsh = new timestampHandler();
    
    //Holds the static data that are downloaded for future re-use
    this.staticData = {};
    
    //Adds a url to the request queue and start executing the queue if its not already executing
    this.addToQueue = function(url, cb) {
        //Local variable to determine whether or not to execute later even though the real one says we are executing the queue
        var execute = false;
        
        //Already here we say that the queue is executing as it will eventually
        if(this.executing === false) {
            this.executing = true;
            execute = true;
        }

        //Create queueitem
        var item = {
            url: url,
            callback: cb
        };
        
        //Insert element
        this.queue.push(item);
        
        //Execute queue if the new promise is the only one in it
        if(execute) this.executeNext();
    };
    
    //Gets the next item in the queue of null
    this.getNextItem = function() {
        //If the queue is not empty return an item
        if(this.queue.length > 0) return this.queue.pop();
        //If it is empty return null    
        else return null;
    }

    //Execute the next item in the queue
    this.executeNext = function() {
        //Get next item
        var item = this.getNextItem();
        
        //Only execute if the queue is not empty
        if(item === null) {
            //No longer executing
            this.executing = false;
            return;
        }
        
        //Check if the rate limit is reached
        var timeRemaining = tsh.getTimeRemaining();
        if(timeRemaining > 0) {
            //Display debug info
            if(this.debug) console.log("Waiting: %s", timeRemaining);
            
            //Run after a delay
            var _this = this;
            setTimeout(function() { _this.makeRequest(item.url, item.callback   ); }, timeRemaining);
        }
        //No rate limit at the moment, proceed
        else {
            //Execute request
            this.makeRequest(item.url, item.callback);
        }
    }
    
    //Makes an actual request
    this.makeRequest = function(url, cb) {
        
        //Create reference to this
        var _this = this;
        
        //Display debug info it is wished
        if (this.debug){
            console.log('Calling url', url);
        }

        //Create options object
        var options = {
            uri: url,
            method: 'GET'
        };
        
        //Add stamp
        tsh.addStamp(new Date());
        
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
            
            //Proceed in the queue
            _this.executeNext();
        }).catch(errors.StatusCodeError, function(error) {
            //Reject
            cb(error);
        }).catch(errors.RequestError, function(error) {
            //Reject
            cb(error);
        });
    }
    
    //Creates the url of the request
    this.generateUrl = function (options) {

        if(options && options.query){
            options.query.api_key = this.key;
        } else {
            options.query = {api_key: this.key};
        }
        
        var result;
        if(options.observer != undefined && options.observer == true) {
            result = url.format({
                protocol: (this.secure) ? 'https:' : 'http:',
                host: this.host + options.path,
                query: options.query
            });
        }
        else if(options.global) {
            result = url.format({
                protocol: (this.secure) ? 'https:' : 'http:',
                host: this.globalPath + this.localPath + options.path,
                query: options.query
            });
        }
        else if(options.static) {
            result = url.format({
                protocol: (this.secure) ? 'https:' : 'http:',
                host: this.globalPath + this.localPath + "static-data/" + options.region + options.path,
                query: options.query
            });
        }
        else {
            result = url.format({
                protocol: (this.secure) ? 'https:' : 'http:',
                host: this.host + this.localPath +  options.region + options.path,
                query: options.query
            });
        }

        return result;

    };
    
    //Creates a promise which adds an url to a queue and resolves when the request has been made
    this.createPromise = function(url) {
        //Helper
        var _this = this;
        
        //Create and return promise
        return new Promise(function(resolve, reject) {
            
            _this.addToQueue(url, function(err, data) {
                
                //Handle error
                if(err) reject(err);
                //Resolve
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
    this.getCurrentVersion = function (region) {
        //Helper
        var _this = this;
        
        //Create url
        var url = _this.generateUrl({
            region: region,
            global: true,
            path: 'static-data/' + region +'/v1.2/versions/'
        });
        
        //Create and return the promise
        return new Promise(function(resolve, reject) {
            //We can call this method directly since its a static endpoint and it does not count towards the rate limit
            _this.makeRequest(url, function(err, data) {
                //Handle errors
                if(err) {
                    reject(err);
                    return;
                }
                //Store in staticData object for future use
                _this.staticData['version'] = data[0];
                //Resolve promise
                resolve(data);
            });
        });
    };
    
    //The match list endpoint of the API
    //Returns a set of matches(API forces a maximum of 20)
    this.getMatchList = function(region, summonerId, championIds, rankedQueues, seasons, beginTime, endTime, beginIndex, endIndex) {
        
        //Helper
        var _this = this;
        
        //Create url
        var url = _this.generateUrl({
            region: region,
            global: true,
            path: 'v2.2/matchlist/by-summoner/' + summonerId,
            query: {
                championIds: championIds,
                rankedQueues: rankedQueues,
                seasons: seasons,
                beginTime: beginTime,
                endTime: endTime,
                beginIndex: beginIndex,
                endIndex: endIndex
            }
        });
        
        return this.createPromise(url);
    }
    
    //Gets the current game data for a summoner
    this.getCurrentGame = function (region, summonerId) {
        //Create url
        var url = this.generateUrl({
            region: region,
            //Is from the observer endpoints
            observer: true,
            path: '/observer-mode/rest/consumer/getSpectatorGameInfo/' + this.platforms[region] + '/' + summonerId
        });
        
        return this.createPromise(url);
    };
    
    //Gets the recent games by a summoner(any type)
    this.getRecentGamesBySummonerId = function (region, summonerId) {
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v1.3/game/by-summoner/' + summonerId + '/recent'
        });
        return this.createPromise(url);
    };
    
    //Gets the champion data
    this.getChampionsData = function (region, freeToPlay) {
        //Create url
        var ftp = Boolean(freeToPlay) || false;
        var url = this.generateUrl({
            region: region,
            path: '/v1.2/champion',
            static: true,
            query: {
                freeToPlay: ftp
            }
        });
        
        return this.createPromise(url);
    };
    
    //Gets the leagues of a summoner(all players in that league)
    this.getLeagueBySummonerId = function (region, summonerId) {
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v2.5/league/by-summoner/' + summonerId
        });
        
        return this.createPromise(url);
    };
    
    //Gets the leagues entries of a summoner
    this.getLeagueEntryBySummonerId = function (region, summonerId) {
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v2.5/league/by-summoner/' + summonerId + '/entry'
        });
        
        return this.createPromise(url);
    };
    
    //Gets the challenger leagues in a type of game
    this.getChallengerLeagueByGametype = function (region, type) {
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v2.5/league/challenger',
            query: {
                type: type
            }
        });
        
        return this.createPromise(url);
    };
    
    //Gets the summary stats of a summoner
    this.getSummaryStatsBySummonerId = function (region, summonerId, season) {

        var query = {};

        if(season){
            query.season = season;
        }
        
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v1.3/stats/by-summoner/' + summonerId + '/summary',
            query: query
        });
        
        return this.createPromise(url);
    };
    
    //Gets the leagues entries of a summoner
    this.getRankedStatsBySummonerId = function (region, summonerId, season) {

        var query = {};

        if(season){
            query.season = season;
        }

        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v1.3/stats/by-summoner/' + summonerId + '/ranked',
            query: query
        });
        
        return this.createPromise(url);
    };
    
    //Gets the challenger leagues in a type of game
    this.getMasteriesBySummonerId = function (region, summonerId) {
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v1.4/summoner/' + summonerId + '/masteries'
        });

        return this.createPromise(url);
    };
    
    //Gets the challenger leagues in a type of game
    this.getRunesBySummonerId = function (region, summonerId) {
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v1.4/summoner/' + summonerId + '/runes'
        });

        return this.createPromise(url);
    };

    //Gets info on a summoner based on his/her name
    this.getSummonerByName = function (region, name){
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v1.4/summoner/by-name/' + name
        });

        return this.createPromise(url);
    };


    //Gets info on a summoner based on his/her id
    this.getSummonerBySummonerId = function (region, summonerId){
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v1.4/summoner/' + summonerId
        });

        return this.createPromise(url);
    };


    //Gets info on a summoner based on his/her id
    this.getTeamsBySummonerId = function (region, summonerId){
        //Create url
        var url = this.generateUrl({
            region: region,
            path: '/v2.2/team/by-summoner/' + summonerId
        });

        return this.createPromise(url);
    };
    
    //DDragon static data
    
    //Realms
    this.getRealms = function (region, cb) {
        var _this = this;
        
        return new Promise(function(resolve, reject) {
            if(_this.staticData.realms) {
                resolve(this.staticData.realms);
                return;
            }

            var url = 'http://ddragon.leagueoflegends.com/realms/' + region + '.json';

            _this.makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    _this.staticData.realms = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Runes
    this.getRunes = function (version, locale) {
        var _this = this;
        
        return new Promise(function(resolve, reject) {
            //If the data exists in the static data object
            if(_this.staticData.runes) {
                //Return that data instead
                resolve(this.staticData.runes);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/rune.json';

            _this.makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    _this.staticData.runes = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Masteries
    this.getMasteries = function (version, locale) {
        var _this = this;
        
        return new Promise(function(resolve, reject) {
            if(_this.staticData.masteries) {
                resolve(this.staticData.masteries);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/mastery.json';

            _this.makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    _this.staticData.masteries = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Champions
    this.getChampions = function (data, locale) {
        var _this = this;
        
        return new Promise(function(resolve, reject) {
            if(_this.staticData.champions) {
                resolve(_this.staticData.champions);
                return;
            }
            
            var version = _this.staticData.version;

            var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/champion.json';

            _this.makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    _this.staticData.champions = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Summoner spells
    this.getSummonerSpells = function (version, locale) {
        var _this = this;
        
        return new Promise(function(resolve, reject) {
            if(_this.staticData.summonerspells) {
                resolve(this.staticData.summonerspells);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/summoner.json';

            _this.makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    _this.staticData.summonerspells = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Summoner spells
    this.getItems = function (version, locale) {
        var _this = this;
        
        return new Promise(function(resolve, reject) {
            if(_this.staticData.items) {
                resolve(this.staticData.items);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/item.json';

            _this.makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    _this.staticData.items = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Summoner spells
    this.getLanguage = function (version, locale) {
        var _this = this;
        
        return new Promise(function(resolve, reject) {
            if(_this.staticData.language) {
                resolve(this.staticData.language);
                return;
            }

	       var url = 'http://ddragon.leagueoflegends.com/cdn/' + version + '/data/' + locale + '/language.json';

            _this.makeRequest(url, function(err, data) {
                if(err) reject(Error(err));
                else {
                    _this.staticData.language = data;
                    resolve(data);
                }
            });
        });
    };
    
    //Data
    this.regions = {
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

    this.readableQueues = {
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

    this.queues = {
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

    this.gametypes = {
        'CUSTOM_GAME': 'Custom game',
        'MATCHED_GAME':	'Matched game',
        'CO_OP_VS_AI_GAME': 'Bot game',
        'TUTORIAL_GAME': 'Tutorial game',
        'RANKED_SOLO_5x5': 'Ranked SoloQ',
        'RANKED_TEAM_5x5': 'Ranked Team 5v5',
        'RANKED_TEAM_3x3': 'Ranked Team 3v3'
    };

    this.gamemode = {
        'CLASSIC': 'Summoner\'s Rift/Twisted Treeline game',
        'ODIN': 'Dominion/Crystal Scar game',
        'ARAM':	'ARAM/Howling Abyss game',
        'TUTORIAL':	'Tutorial game'
    };

    this.platforms = {
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
    (function init(api) {
        console.log("initializing");
        //Get the version upon creation
        api.getCurrentVersion('euw').catch(function(error) {
            console.log("Failed to load current version: %s", error);
        });
    })(this);
    
    //Return this object
    return this;
}

//This class holds information on when calls were made to the API endpoint
//It holds a maximum of 10 timestamps
//maxTime is in seconds
var timestampHandler = function(settings) {
    this.timestamps = [];
    this.maxCalls = (settings) ? settings.maxCalls : 10;
    this.maxTime  = (settings) ? settings.maxTime  : 10;
    
    //Returns the time remaining before a new call can be made in milliseconds
    this.getTimeRemaining = function() {
        if(this.timestamps.length == this.maxCalls) {
            //Return the time in milliseconds, therefore transform maxTune to ms
            return (this.maxTime * 1000) - (new Date() - this.timestamps[0]);
        }
        else {
            //If there are less than the set amount og max calls made, the time until the next can be made is always 0
            return 0;
        }
    }
    
    //Adds a timestamp
    this.addStamp = function(timestamp) {
        //Remove if at max calls
        if(this.timestamps.length == this.maxCalls) this.timestamps.shift();
        
        //Insert
        this.timestamps.push(timestamp);
    }
}

module.exports = RiotAPI;