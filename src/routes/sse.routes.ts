import { Router } from 'express';
import { jwtAuth } from '../middleware/jwtAuth';
import { streamEvents } from '../controllers/sse.controller';

const router = Router();

/**
 * @openapi
 * /api/sse/stream:
 *   get:
 *     tags: [SSE]
 *     summary: Subscribe to real-time Server-Sent Events
 *     description: |
 *       Opens a persistent SSE connection scoped to the authenticated company.
 *       Events include: shift.clock_in, shift.clock_out, heartbeat,
 *       break.start, break.end, idle.reported, screenshot.captured
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: SSE stream opened
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get('/stream', jwtAuth, streamEvents);

export default router;
