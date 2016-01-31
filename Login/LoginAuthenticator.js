"use strict";

var crypto = require('crypto'),
    Database = require('../Database/Database.js'),
    UserNotFoundError = require('../Errors/UserNotFoundError.js'),
    InternalServerError = require('../Errors/InternalServerError.js'),
    IncorrectPasswordError = require('../Errors/IncorrectPasswordError.js'),
    Promise = require('bluebird'),
    Config = require('../Config/config.js');

/*
 * Handles the process of logging users in.
 * Checks that their credentials match the database,
 * removes SQL language and creates access_tokens.
 */
var LoginAuthenticator = (function() {
    
    /*
     * The public method used to start the login process.
     *
     * Finds the username from the database, then tries to match
     * the submitted password and the one from the database.
     *
     * Will resolve with an access token on success, or with an error
     * describing what was wrong on failure.
     *
     * @param {String} username The email of the user
     * @param {String} password
     */
    function login(username, password) {
        var dbData;
        return new Promise(function(resolve, reject) {
            Database.getUser(username).then(function(data) {
                dbData = data;
                /* Check the password against the encrypted one in the database */
                var sha = crypto.createHash('sha512').update(password);
                var hash = sha.digest('hex');
                if(data.password === hash) {
                    /* Passwords match */
                    /* Create login series */
                    return createAccessTokens(dbData.userid);
                }
                else {
                    reject(new IncorrectPasswordError("Incorrect password"));
                }
                
            }).then(function(tokens) {
                /* Resolve with the newly created tokens */
                resolve(tokens);
                
            }).catch(function(error) {
                console.log(error);
                reject(error);
            });
        });
    }
    
    /* Logs a user out of by removing any access and refresh tokens
     * associated with the user.
     * @param {String} access_token
     */
    function logout(access_token) {
        return Database.getAccessTokenData(access_token).then(function(data) {
            return invalidateTokensForUser(data.userid);
        });
    }
    
    /* Invalidates any existing tokens for the user.
     * Will delete any access tokens and refresh tokens.
     *
     * @param {Integer} userid
     */
    function invalidateTokensForUser(userid) {
        return new Promise(function(resolve, reject) {
            Database.deleteAccessTokens(userid).then(function() {
                return Database.deleteRefreshTokens(userid);
            }).then(function() {
                resolve();
            }).catch(function(error) {
                reject(error)
            });
        });
    }
    
    /* Creates new access tokens for a given user
     * 
     * Creates access tokens and corresponding refresh tokens
     * with a set expiry date defined in the config
     *
     * Will resolve with a object containing an access token, refresh token and expiry time.
     * If not able to create tokens, will reject with the error
     *
     * @param {Integer} userid
     */
    function createAccessTokens(userid) {
        return new Promise(function(resolve, reject) {
            var created = new Date(),
                token_object = {
                    expiryDate: (new Date()).setHours(created.getHours() + Config.accessTokenExpiry)
                };
            
            /* Get a new token */
            createRandomToken().then(function(access_token) {
                token_object.access_token = access_token;
                
                /* Nest since we need both refresh and
                 * access tokens to be successfully made */
                createRandomToken().then(function(refresh_token) {
                    token_object.refresh_token = refresh_token;
                    return Database.registerTokens(userid, token_object.access_token, token_object.refresh_token, created, token_object.expiryDate);
                    
                }).then(function() {
                    resolve(token_object);
                    
                }).catch(function(error) {
                    reject(error);
                });
                
            }).catch(function(error) {
                reject(error);
            });
        });
    }
    
    /* Creates a randomg token.
     * Will run again if the token already exists in the database */
    function createRandomToken() {
        return new Promise(function(resolve, reject) {
            /* Create random token */
            var token = crypto.randomBytes(32).toString('hex');
            
            /* Check that the random token does not exist in the database
             * Even though there is extremely low probability for this, it should
             * be confirmed */
            Database.accessTokenExists(token).then(function(bool) {
                if(!bool) {
                    resolve(token);
                }
                else {
                    //Recursion
                    createRandomToken().then(function(token) {
                        resolve(token);
                    }).catch(function(error) {
                        reject(error);
                    });
                }
                    
            }).catch(function(error) {
                reject(error);
            });
        });
    }
    
    return {
        login: login
    }
    
}());

module.exports = LoginAuthenticator;