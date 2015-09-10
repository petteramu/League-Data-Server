var RiotAPI = require('./api.js');
var max = 50,
    c   = 0;

var api = new RiotAPI({
    secure: true
});
for(var i = 0; i < max; i++) {
    api.getRecentGamesBySummonerId('euw', 399670).then(function(data) {
        console.log(c++ + "/" + max);
    }).catch(function(err) {
        console.log(err);
    });
}