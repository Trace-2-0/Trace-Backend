import { Router } from 'express';
import { jwtAuth, requireRole } from '../middleware/jwtAuth';
import { validate } from '../middleware/validate';
import { updateSettingsSchema } from '../validators/schemas';
import { getSettings, updateSettings } from '../controllers/settings.controller';

const router = Router();
router.use(jwtAuth);

/**
 * @openapi
 * /api/settings:
 *   get:
 *     tags: [Settings]
 *     summary: Get company settings
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Company settings
 */
router.get('/', getSettings);

/**
 * @openapi
 * /api/settings:
 *   patch:
 *     tags: [Settings]
 *     summary: Update company settings
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expectedWorkSecs:
 *                 type: integer
 *                 example: 28800
 *               screenshotIntervalSecs:
 *                 type: integer
 *                 example: 300
 *               heartbeatGraceSecs:
 *                 type: integer
 *                 example: 5400
 *               lateThresholdTime:
 *                 type: string
 *                 example: "09:30"
 *               maxBreaksPerShift:
 *                 type: integer
 *                 example: 3
 *               blurScreenshotsOnBreak:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.patch(
  '/',
  requireRole('admin'),
  validate({ body: updateSettingsSchema }),
  updateSettings
);

export default router;
