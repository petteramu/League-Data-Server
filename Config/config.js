var config = {
    updateIntevals: {
        role: 24,
        league: 3,
        champion: 3
    },
    
    //The current season to fetch data from
    currentSeason: 'SEASON2016',
    
    //Number of top champions that will be fetched from the database
    numberOfTopChampions: 5,
    
    //Amount of hours the access tokens are valid for
    accessTokenExpiry: 9
};

module.exports = config;