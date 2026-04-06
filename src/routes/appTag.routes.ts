import { Router } from 'express';
import { jwtAuth, requireRole } from '../middleware/jwtAuth';
import { validate } from '../middleware/validate';
import { upsertAppTagSchema, idParamSchema } from '../validators/schemas';
import {
  listAppTags,
  upsertAppTag,
  deleteAppTag,
} from '../controllers/appTag.controller';

const router = Router();
router.use(jwtAuth);

/**
 * @openapi
 * /api/app-tags:
 *   get:
 *     tags: [App Tags]
 *     summary: List all app tags
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of app tags
 */
router.get('/', listAppTags);

/**
 * @openapi
 * /api/app-tags:
 *   put:
 *     tags: [App Tags]
 *     summary: Upsert an app tag (productive/unproductive/neutral)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appName, tag]
 *             properties:
 *               appName:
 *                 type: string
 *                 example: VS Code
 *               tag:
 *                 type: string
 *                 enum: [productive, unproductive, neutral]
 *     responses:
 *       200:
 *         description: App tag upserted
 */
router.put(
  '/',
  requireRole('admin', 'manager'),
  validate({ body: upsertAppTagSchema }),
  upsertAppTag
);

/**
 * @openapi
 * /api/app-tags/{id}:
 *   delete:
 *     tags: [App Tags]
 *     summary: Delete an app tag
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: App tag deleted
 */
router.delete(
  '/:id',
  requireRole('admin', 'manager'),
  validate({ params: idParamSchema }),
  deleteAppTag
);

export default router;
