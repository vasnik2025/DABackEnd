
import express from 'express';
import { createOrder, captureOrder } from '../controllers/paypalOrderController';

const router = express.Router();

router.post('/create-order', createOrder);
router.post('/capture-order', captureOrder);

export default router;
