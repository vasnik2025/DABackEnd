"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const geminiController_1 = require("../controllers/geminiController");
const router = express_1.default.Router();
router.post('/find-locations', geminiController_1.findLocationsWithGemini);
router.post('/location-details', geminiController_1.getLocationDetailsWithGemini);
exports.default = router;
