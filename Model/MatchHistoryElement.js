var MatchHistoryElement = function(championId, winner, image) {
    this.championId = championId;
    this.winner = winner;
    this.championImage = image;
    
    return this;
};

module.exports = MatchHistoryElement;