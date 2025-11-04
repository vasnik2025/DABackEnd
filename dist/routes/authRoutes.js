"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// FIX: Changed type-only import to standard import to fix type resolution.
const express_1 = __importDefault(require("express"));
const authController = __importStar(require("../controllers/authController"));
const passwordShareController_1 = require("../controllers/passwordShareController");
// Normalize aliases the UI might send so the controllers get {email,password}
function normalizeAuthInput(req, _res, next) {
    const b = (req.body ?? {});
    const email = String(b.email ?? b.usernameOrEmail ?? b.identifier ?? '')
        .trim()
        .toLowerCase();
    const password = typeof b.password === 'string' ? b.password : '';
    req.body = { ...b, email, password };
    next();
}
const router = express_1.default.Router();
router.post('/register', normalizeAuthInput, authController.register);
router.post('/login', normalizeAuthInput, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.me);
router.post('/forgot-password', authController.initiatePasswordReset);
router.post('/forgot-password/verify', authController.verifyPasswordResetCode);
router.post('/reset-password', authController.resetPasswordWithToken);
// Verification routes
router.post('/verification/resend', authController.resendVerificationEmails);
router.get('/verify-email', authController.verifyEmail);
router.post('/verify-email', authController.verifyEmailApi);
router.get('/verify-partner-email', authController.verifyPartnerEmail);
router.post('/verify-partner-email', authController.verifyPartnerEmailApi);
router.get('/password-share/:token', passwordShareController_1.viewPasswordShare);
exports.default = router;
