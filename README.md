# League-Data-Server
Serves data on a current game of League of Legends to the client.

Connect with a socket and emit a request to fetch data.
request with the message:
- "get:currentgame", along with a name of the summoner as well as the region to fetch data on that summoners current game.
- "get:randomgame", along with a region to get a random game
