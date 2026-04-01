"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeIdentifier = normalizeIdentifier;
exports.normalizeIdentifierInput = normalizeIdentifierInput;
function normalizeIdentifier(identifier) {
    return (identifier ?? '').trim().toLowerCase();
}
function normalizeIdentifierInput(raw) {
    return normalizeIdentifier(raw);
}
//# sourceMappingURL=identifier-normalizer.js.map