"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginFailureMap = void 0;
const common_1 = require("@nestjs/common");
exports.loginFailureMap = {
    invalid_credentials: {
        statusCode: common_1.HttpStatus.UNAUTHORIZED,
        category: 'invalid_credentials',
        message: 'Invalid credentials or account not found.',
        recoveryAction: 'Verify credentials or start recovery.',
    },
    account_not_ready: {
        statusCode: common_1.HttpStatus.UNAUTHORIZED,
        category: 'account_not_ready',
        message: 'Account not ready for login.',
        recoveryAction: 'Complete verification or recover the account.',
    },
    rate_limited: {
        statusCode: common_1.HttpStatus.TOO_MANY_REQUESTS,
        category: 'rate_limited',
        message: 'Too many login attempts.',
        recoveryAction: 'Wait a moment before retrying or recover your account.',
    },
};
//# sourceMappingURL=auth-error-mapper.js.map