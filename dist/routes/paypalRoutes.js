"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const paypalOrderController_1 = require("../controllers/paypalOrderController");
const router = express_1.default.Router();
router.post('/create-order', paypalOrderController_1.createOrder);
router.post('/capture-order', paypalOrderController_1.captureOrder);
exports.default = router;
