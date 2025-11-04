"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messageController_1 = require("../controllers/messageController");
const router = express_1.default.Router();
router.post('/', messageController_1.sendMessage);
router.get('/conversation/:otherUserId', messageController_1.getConversation);
router.delete('/conversation/:otherUserId', messageController_1.deleteConversation);
router.get('/conversations/:userId', messageController_1.getConversationsList);
router.put('/:messageId/status', messageController_1.updateMessageStatus);
exports.default = router;
