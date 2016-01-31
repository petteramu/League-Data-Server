"use strict";

var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    express = require('express'),
    bodyParser = require('body-parser'),
    socketio = require('socket.io'),
    ServerController = require('./Controllers/ServerController.js'),
    ServerConfig = require('./ServerConfig.js'),
    UserNotFoundError = require('./Errors/UserNotFoundError.js'),
    InternalServerError = require('./Errors/InternalServerError.js'),
    IncorrectPasswordError = require('./Errors/IncorrectPasswordError.js'),
    LoginAuthenticator = require('./Login/LoginAuthenticator.js'),
    Config = require('./Config/config.js'),
    passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    Database = require('./Database/Database.js'),
    crypto = require('crypto');
    
//CORS middleware
var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
}

//Certifications
var options = {
  key: fs.readFileSync('./cert/server.key'),
  cert: fs.readFileSync('./cert/server.crt')
};

//Set up server
var app = express(),
    httpsserver = http.createServer(app),
    io = socketio.listen(httpsserver);

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(username, done) {
  Database.getUser(username).then(function(user) {
    done(null, user);
  }).catch(function(error) {
      console.log(error);
      done(error);
  });
});

/* Set up passport strategy */
passport.use(new LocalStrategy(
    function(username, password, done) {
        Database.getUser(username).then(function(data) {
            /* Check the password against the encrypted one in the database */
            var sha = crypto.createHash('sha512').update(password);
            var hash = sha.digest('hex');
            if(data.password === hash) {
                /* Passwords match */
                done(null, username);
            }
            else {
                done(null, false, { message: 'Incorrect password.' });
            }

        }).catch(UserNotFoundError, function(error) {
            done(null, false, { message: 'User not found' });

        }).catch(function(error) {
            done(error);
        });
    }
));

var server = (function() {
    var instance = this;
    app.use(passport.initialize());
    
    app.use(allowCrossDomain);
    app.use(bodyParser.urlencoded({
        extended: true
    }));
    
    //Allow connections from outside domains
    io.set('origins', '*:*');
    
    //Start listening
    httpsserver.listen(ServerConfig.port, function() {
        console.log("Server listening on: " + ServerConfig.port);
    });
    
    /**
     * Handle connections via sockets.io
     */
    io.sockets.on('connection', function (socket) {
        console.log( "- Connection established: " + socket );
        addListeners(socket);
    });
    
    /**
     * Adds listeners to the the events for the given socket:
     * 
     * - Get:Currentgame
     *      Requests for ingame information on a given summoner.
     *
     *      Parameters:
     *          - Summoner name
     *          - Region
     * 
     * - Get:Randomgame
     *      Requests ingame information on a random game
     *      Primarily used for testing purposes or by individuals
     *      that do not have knowledge of the game
     *
     *      Parameters:
     *          - Region
     *
     * - Disconnect
     *      Listens for disconnects
     *      Delegates the event to the ServerController such that it can remove the
     *      socket from any GameControllers
     *
     * @param {Socket} socket
     */
    var addListeners = function(socket) {
        socket.on('get:currentgame', function(data) {
            console.log( "- Request received for current game data: " + socket );
            
            //Normalize name
            var name = data.name.toLowerCase().replace(" ", ""),
                region = data.region || 'euw'
            
            ServerController.requestGameInformation(socket, name, region);
        });
        
        
        socket.on('get:randomgame', function(data) {
            console.log( "- Request received for random game data: " + socket );
            
            //Normalize name
            var region = data.region || 'euw';
            ServerController.requestRandomGame(socket, region);
        });
                
        //Log disconnects
        socket.on('disconnect', function() {
            console.log('Got disconnect!');
        });
    }
    
    /* Handle login requests
     * 
     * Since we use AJAX requests for logins, do not use the passport strategies as 
     * middleware, as that is based on navigating to the given directory
     * and not AJAX calls. This means we need to add the request data to
     * the */
    app.post('/login/', function handleLocalAuthentication(req, res, next) {
        passport.authenticate('local', function(err, user, info) {
            if (err) return next(err);
            if (!user) {
                return res.json(403, {
                    message: "Unknown user"
                });
            }

            // Manually establish the session...
            req.login(user, function(err) {
                if (err) return next(err);
                return res.json({
                    message: 'Successfull login',
                });
            });

        })(req, res, next);
    });
    
    /**
     * Login
     *
     * Handles the login requests sent to the server
     * Will decline the request if there are any missing credentials.
     * Will also handle all the responses to the client.
     *
     * Upon success, it will return data 
     */
    app.post('/access_token/', function(req, res) {
        console.log("Login request received for username: %s", req.body.username);
        
        if(req.body.username && req.body.password) {
            
            /* Delegate to the LoginAuthenticator */
            LoginAuthenticator.login(req.body.username, req.body.password).then(function(data) {
                //Success
                var response = {
                    success: true,
                    data: data
                }
                res.json(response).end();
                
                console.log("Login request successfull");
                
            }).catch(UserNotFoundError, function(error) {
                //Failure
                var response = {
                    success: false,
                    reason: error.message
                }
                
                res.json(401, response).end();
                
                console.log("Login request unsuccessfull");
                
            }).catch(InternalServerError, function(error) {
                //Failure
                var response = {
                    success: false,
                    reason: error.message
                }
                
                res.json(503, response).end();
                
                console.log("Login request unsuccessfull");
                
            }).catch(IncorrectPasswordError, function(error) {
                //Failure
                var response = {
                    success: false,
                    reason: error.message
                }
                
                res.json(401, response).end();
                
                console.log("Login request unsuccessfull");
                
            }).catch(function(error) {
                console.log(error.stack);
            });
        }
        else {
            var response = {
                success: false,
                reason: "Missing credentials"
            }
            res.status(400).json(response).end();

        }
    });
    
    app.delete('/access_token/', function(req, res) {
        console.log("Log out request received");
        
        if(req.body.access_token) {
            LoginAuthenticator.logout(req.body.access_token).then(function() {
                res.status(200).end();
            }).catch(function(error) {
                res.status(503).end();
            });
        }
        else {
            var response = {
                success: false,
                reason: "Missing credentials"
            }
            res.status(400).json(response).end();
        }
    });
}());

module.exports = server;