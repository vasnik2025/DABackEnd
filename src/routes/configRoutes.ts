
import express from 'express';
import { getPaypalClientId } from '../controllers/configController';

const router = express.Router();

router.get('/paypal-client-id', getPaypalClientId);

export default router;