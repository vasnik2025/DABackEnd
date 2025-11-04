"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const voiceMessageController_1 = require("../controllers/voiceMessageController");
const router = express_1.default.Router();
router.post('/', voiceMessageController_1.createVoiceMessage);
router.get('/inbox', voiceMessageController_1.listVoiceMessagesForRecipient);
router.get('/:voiceMessageId/audio', voiceMessageController_1.fetchVoiceMessageAudio);
router.post('/:voiceMessageId/acknowledge', voiceMessageController_1.acknowledgeVoiceMessage);
exports.default = router;
