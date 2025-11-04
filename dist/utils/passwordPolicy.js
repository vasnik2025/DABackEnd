"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSWORD_REQUIREMENTS_MESSAGE = exports.PASSWORD_MIN_LENGTH = void 0;
exports.isPasswordStrong = isPasswordStrong;
exports.PASSWORD_MIN_LENGTH = 8;
const UPPERCASE_REGEX = /[A-Z]/;
const DIGIT_REGEX = /\d/g;
exports.PASSWORD_REQUIREMENTS_MESSAGE = 'Password must include at least 8 characters, one uppercase letter, and two numbers.';
function isPasswordStrong(password) {
    if (typeof password !== 'string') {
        return false;
    }
    if (password.length < exports.PASSWORD_MIN_LENGTH) {
        return false;
    }
    if (!UPPERCASE_REGEX.test(password)) {
        return false;
    }
    const digitMatches = password.match(DIGIT_REGEX);
    if (!digitMatches || digitMatches.length < 2) {
        return false;
    }
    return true;
}
