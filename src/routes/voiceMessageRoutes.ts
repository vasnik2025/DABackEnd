import express from 'express';
import {
  createVoiceMessage,
  listVoiceMessagesForRecipient,
  fetchVoiceMessageAudio,
  acknowledgeVoiceMessage,
} from '../controllers/voiceMessageController';

const router = express.Router();

router.post('/', createVoiceMessage);
router.get('/inbox', listVoiceMessagesForRecipient);
router.get('/:voiceMessageId/audio', fetchVoiceMessageAudio);
router.post('/:voiceMessageId/acknowledge', acknowledgeVoiceMessage);

export default router;
