var GameSubscriber = function(socket) {
    this.socket = socket;
    this.stages = {
        core: false,
        league: false,
        champion: false,
        matchhistory: false,
        mostplayed: false,
        roles: false
    }
    this.listeningTo;
    
    /**
     * Resets the stages of a socket
     */
    this.resetStages = function() {
        for(var property in this.stages) {
            if(this.stages.hasOwnProperty(property)) {
                this.stages[property] = false;
            }
        }
    }
    
    /**
     * Sets the value of a stage
     */
    this.setStage = function(stage, boolean) {
        this.stages[stage] = boolean;
    }
    
    return this;
}

module.exports = GameSubscriber;