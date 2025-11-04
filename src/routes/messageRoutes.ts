
import express from 'express';
import { 
  sendMessage,
  getConversation,
  updateMessageStatus,
  getConversationsList,
  deleteConversation,
 } from "../controllers/messageController";

const router = express.Router();

router.post('/', sendMessage);

router.get('/conversation/:otherUserId', getConversation);

router.delete('/conversation/:otherUserId', deleteConversation);

router.get('/conversations/:userId', getConversationsList);

router.put('/:messageId/status', updateMessageStatus);

export default router;
