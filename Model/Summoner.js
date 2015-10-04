/**
 * Simple object for representing summoners in the responses
 * @param {Long} summonerId The summonerId of the summoner
 * @param {Integer} participantNo The participant number of the summoner
 * @param {Integer} championId
 * @param {Integer} teamId
 */
var Summoner = function(summonerId, name, participantNo, championId, teamId, region) {
    this.participantNo = participantNo;
    this.summonerId = summonerId;
    this.teamId = teamId;
    this.championId = championId;
    this.region = region;
    this.summonerName = name;
    
    return this;
}

module.exports = Summoner;