"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const configController_1 = require("../controllers/configController");
const router = express_1.default.Router();
router.get('/paypal-client-id', configController_1.getPaypalClientId);
exports.default = router;
