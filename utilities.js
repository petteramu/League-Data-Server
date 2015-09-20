var Utilities = function() {
    return {
        getRealRole: function(role, lane) {
            switch(role) {
                case 'DUO_CARRY':
                    return 'ADC';
                case 'DUO_SUPPORT':
                    return 'Support';
                case 'SOLO':
                    return (lane != '') ? lane : 'Other';
                case 'NONE':
                    if(lane == 'JUNGLE') return lane;
                    else return 'Other';
                default:
                    return 'Other';
            }
        }
    }
}

module.exports = Utilities;