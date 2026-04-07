import { Router } from 'express';
import { jwtAuth } from '../middleware/jwtAuth';
import { getScreenshotUrl, getStorageStatus } from '../controllers/storage.controller';

const router = Router();

// All storage routes require admin/manager JWT auth
router.use(jwtAuth);

/**
 * @openapi
 * /api/storage/status:
 *   get:
 *     tags: [Storage]
 *     summary: Get current storage configuration status
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Storage status (no credentials exposed)
 */
router.get('/status', getStorageStatus);

/**
 * @openapi
 * /api/storage/screenshot/{screenshotId}/url:
 *   get:
 *     tags: [Storage]
 *     summary: Get a pre-signed URL for a screenshot (valid 1 hour)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: screenshotId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pre-signed URL with expiry timestamp
 *       404:
 *         description: Screenshot not found
 */
router.get('/screenshot/:screenshotId/url', getScreenshotUrl);

export default router;
