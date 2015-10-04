var Utilities = (function() {
    
    return {
        getRealRole: function(role, lane) {
            switch(role) {
                case 'DUO_CARRY':
                    return 'Adc';
                case 'DUO_SUPPORT':
                    return 'Support';
                case 'SOLO':
                    return (lane != '') ? this.capitalize(lane, true) : 'Other';
                case 'NONE':
                    if(lane == 'JUNGLE') return "Jungle";
                    else return 'Other';
                default:
                    return 'Other';
            }
        },
        
        capitalize: function(string, lower) {
            return (lower ? string.toLowerCase() : string).replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
        }
    }
}());

module.exports = Utilities;