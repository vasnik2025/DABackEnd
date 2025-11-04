"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readUser = readUser;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const COOKIE_NAME = 'sua';
function readUser(req, res, next) {
    try {
        const token = req.cookies?.[COOKIE_NAME];
        if (token) {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            if (decoded?.id) {
                const { country = null } = decoded;
                req.user = { id: String(decoded.id), country };
            }
        }
    }
    catch { /* ignore invalid tokens */ }
    next();
}
