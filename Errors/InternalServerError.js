/**
 * Represents the event where the username is not present in the database
 */
function InternalServerError(message) {
    this.name = "InternalServerError";
    this.message = message || "";
 }

InternalServerError.prototype = Object.create(Error.prototype);

module.exports = InternalServerError;