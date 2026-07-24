import { Router } from 'express';
import { checkout } from '../controllers/subscription.controller';
import { jwtAuth } from '../middleware/jwtAuth'; 

const router = Router();

// Endpoint for frontend to create a Razorpay subscription
// Protected by JWT auth because only logged-in admins can upgrade
router.post('/checkout', jwtAuth, checkout);

export default router;
