"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = require("express");
const imageProxyController_1 = require("../controllers/imageProxyController");
const router = (0, express_1.Router)();
const mediaCors = (0, cors_1.default)({
    origin: [
        "https://swingerunion.com",
        "https://www.swingerunion.com",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    methods: ["GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
});
router.options("/proxy", mediaCors, imageProxyController_1.proxyExternalImage);
router.get("/proxy", mediaCors, imageProxyController_1.proxyExternalImage);
exports.default = router;
