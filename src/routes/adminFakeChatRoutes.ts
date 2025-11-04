import { Router } from 'express';
import {
  adminSendFakeMessage,
  getFakeConversation,
  listFakeChatMedia,
  listFakeConversations,
  uploadFakeChatMedia,
} from '../controllers/adminFakeChatController';

const router = Router();

router.get('/', listFakeConversations);
router.get('/:fakeUserId/:realUserId', getFakeConversation);
router.get('/:fakeUserId/:realUserId/media', listFakeChatMedia);
router.post('/:fakeUserId/:realUserId/media', uploadFakeChatMedia);
router.post('/:fakeUserId/:realUserId/messages', adminSendFakeMessage);

export default router;
