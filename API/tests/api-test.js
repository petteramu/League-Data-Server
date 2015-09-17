var RiotAPI = require('../api.js');
var max = 1,
    c   = 0;

var api = new RiotAPI({
    secure: true
});
for(var i = 0; i < max; i++) {
    api.getMatchList('euw', 399670, null, 'RANKED_SOLO_5x5', 'SEASON2015', null, null, null, null).then(function(data) {
        console.log(data);
    }).catch(function(err) {
        console.log(err);
    });
}