/**
 * Represents the event where the username is not present in the database
 */
function UserNotFoundError(message) {
    this.name = "IncorrectPasswordError";
    this.message = message || "";
 }

UserNotFoundError.prototype = Object.create(Error.prototype);

module.exports = UserNotFoundError;