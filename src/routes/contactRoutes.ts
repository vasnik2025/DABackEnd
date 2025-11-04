
import express from 'express';
import { handleSendContactForm } from '../controllers/contactController';

const router = express.Router();

router.post('/', handleSendContactForm);

export default router;