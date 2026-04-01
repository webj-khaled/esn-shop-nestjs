"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginFailureResponse = void 0;
class LoginFailureResponse {
    status;
    message;
    recoveryAction;
    constructor(status, message, recoveryAction) {
        this.status = status;
        this.message = message;
        this.recoveryAction = recoveryAction;
    }
}
exports.LoginFailureResponse = LoginFailureResponse;
//# sourceMappingURL=login.failure.js.map