import { Router } from 'express';
import { checkout, webhook } from '../controllers/subscription.controller';
import { jwtAuth } from '../middleware/jwtAuth'; 

const router = Router();

/**
 * @openapi
 * /api/subscription/checkout:
 *   post:
 *     tags: [Subscription]
 *     summary: Create a Razorpay subscription for starter or business plan
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planType
 *             properties:
 *               planType:
 *                 type: string
 *                 enum: [starter, business]
 *     responses:
 *       200:
 *         description: Subscription created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscriptionId:
 *                   type: string
 *       400:
 *         description: Missing or invalid planType
 */
router.post('/checkout', jwtAuth, checkout);

/**
 * @openapi
 * /api/subscription/webhook:
 *   post:
 *     tags: [Subscription]
 *     summary: Webhook receiver for Razorpay payment events
 *     description: Called directly by Razorpay servers upon payment capture/authentication to upgrade company tier.
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid signature or payload
 */
router.post('/webhook', webhook);

export default router;
