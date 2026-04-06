import { Router } from 'express';
import { agentAuth } from '../middleware/agentAuth';
import { validate } from '../middleware/validate';
import {
  clockInSchema,
  clockOutSchema,
  heartbeatSchema,
  reportIdleSchema,
  uploadScreenshotSchema,
  syncAppUsageSchema,
  disconnectSchema,
} from '../validators/schemas';
import {
  clockIn,
  clockOut,
  heartbeat,
  breakStart,
  breakEnd,
  reportIdle,
  uploadScreenshot,
  syncAppUsage,
  getStatus,
  disconnectIntent,
} from '../controllers/agent.controller';

const router = Router();

// All agent routes require agent token auth
router.use(agentAuth);

/**
 * @openapi
 * /api/agent/clock-in:
 *   post:
 *     tags: [Agent]
 *     summary: Clock in — starts a new shift
 *     security:
 *       - AgentToken: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deviceOs:
 *                 type: string
 *                 example: windows
 *     responses:
 *       201:
 *         description: Shift created
 *       409:
 *         description: Already clocked in
 */
router.post('/clock-in', validate({ body: clockInSchema }), clockIn);

/**
 * @openapi
 * /api/agent/clock-out:
 *   post:
 *     tags: [Agent]
 *     summary: Clock out — ends the active shift
 *     security:
 *       - AgentToken: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               checkoutType:
 *                 type: string
 *                 enum: [manual, shutdown, powercut]
 *                 example: manual
 *               checkoutReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Shift ended with computed totals
 *       400:
 *         description: No active shift
 */
router.post('/clock-out', validate({ body: clockOutSchema }), clockOut);

/**
 * @openapi
 * /api/agent/heartbeat:
 *   post:
 *     tags: [Agent]
 *     summary: Heartbeat — keeps the shift alive
 *     security:
 *       - AgentToken: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Heartbeat recorded
 */
router.post('/heartbeat', validate({ body: heartbeatSchema }), heartbeat);

/**
 * @openapi
 * /api/agent/break/start:
 *   post:
 *     tags: [Agent]
 *     summary: Start a break
 *     security:
 *       - AgentToken: []
 *     responses:
 *       201:
 *         description: Break started
 *       409:
 *         description: Already on a break
 */
router.post('/break/start', breakStart);

/**
 * @openapi
 * /api/agent/break/end:
 *   post:
 *     tags: [Agent]
 *     summary: End the active break
 *     security:
 *       - AgentToken: []
 *     responses:
 *       200:
 *         description: Break ended
 *       400:
 *         description: No active break
 */
router.post('/break/end', breakEnd);

/**
 * @openapi
 * /api/agent/idle:
 *   post:
 *     tags: [Agent]
 *     summary: Report an idle session
 *     security:
 *       - AgentToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startTime, endTime, durationSecs]
 *             properties:
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               durationSecs:
 *                 type: integer
 *                 example: 120
 *     responses:
 *       201:
 *         description: Idle session recorded
 */
router.post('/idle', validate({ body: reportIdleSchema }), reportIdle);

/**
 * @openapi
 * /api/agent/screenshot:
 *   post:
 *     tags: [Agent]
 *     summary: Upload a screenshot (base64)
 *     security:
 *       - AgentToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageBase64]
 *             properties:
 *               imageBase64:
 *                 type: string
 *                 description: Base64-encoded image data
 *               capturedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Screenshot saved
 */
router.post(
  '/screenshot',
  validate({ body: uploadScreenshotSchema }),
  uploadScreenshot
);

/**
 * @openapi
 * /api/agent/app-usage/sync:
 *   post:
 *     tags: [Agent]
 *     summary: Sync app usage data (batch upsert)
 *     security:
 *       - AgentToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [usage]
 *             properties:
 *               active:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   name:
 *                     type: string
 *                   title:
 *                     type: string
 *                   pid:
 *                     type: integer
 *               usage:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, seconds]
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: VS Code
 *                     seconds:
 *                       type: integer
 *                       example: 120
 *     responses:
 *       200:
 *         description: App usage synced
 */
router.post(
  '/app-usage/sync',
  validate({ body: syncAppUsageSchema }),
  syncAppUsage
);

/**
 * @openapi
 * /api/agent/status:
 *   get:
 *     tags: [Agent]
 *     summary: Get current shift status and company settings
 *     security:
 *       - AgentToken: []
 *     responses:
 *       200:
 *         description: Current status
 */
router.get('/status', getStatus);

/**
 * @openapi
 * /api/agent/disconnect:
 *   post:
 *     tags: [Agent]
 *     summary: Graceful disconnect intent (shutdown / power-cut)
 *     security:
 *       - AgentToken: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: desktop_exit
 *               disconnectedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Disconnect recorded
 */
router.post(
  '/disconnect',
  validate({ body: disconnectSchema }),
  disconnectIntent
);

export default router;
