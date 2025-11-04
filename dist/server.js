"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
try {
    require('dotenv/config');
}
catch (error) {
    if (process?.env?.NODE_ENV !== 'production') {
        console.warn('[startup] dotenv/config module not found; continuing without .env file support.');
    }
}
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const emailService_1 = require("./utils/emailService");
const membershipMaintenance_1 = require("./jobs/membershipMaintenance");
const fakePresenceRotation_1 = require("./jobs/fakePresenceRotation");
const PORT = Number(process.env.PORT || 8080);
async function start() {
    try {
        console.log('[startup] Connecting to database...');
        await (0, db_1.getPool)();
        console.log('[startup] DateAstrum database connected.');
        console.log('[startup] Verifying email service connection...');
        const mailOK = await (0, emailService_1.verifyMailConnections)();
        if (mailOK) {
            console.log('[startup] Email service is configured and ready.');
        }
        else {
            console.warn('[startup] Email service is NOT configured. Emails will not be sent.');
        }
        (0, membershipMaintenance_1.scheduleMembershipMaintenance)();
        console.log('[startup] Membership maintenance scheduler initialised.');
        (0, fakePresenceRotation_1.scheduleFakePresenceRotation)();
        console.log('[startup] Fake presence rotation scheduler initialised.');
        app_1.default.listen(PORT, () => console.log(`[startup] DateAstrum API listening on :${PORT}`));
    }
    catch (e) {
        console.error('[startup] Failed to start server:', e);
        process.exit(1);
    }
}
start();
