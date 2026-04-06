import { Router } from 'express';
import { jwtAuth, requireRole } from '../middleware/jwtAuth';
import { validate } from '../middleware/validate';
import {
  createTeamSchema,
  updateTeamSchema,
  idParamSchema,
} from '../validators/schemas';
import {
  listTeams,
  createTeam,
  updateTeam,
  deleteTeam,
} from '../controllers/team.controller';

const router = Router();
router.use(jwtAuth);

/**
 * @openapi
 * /api/teams:
 *   get:
 *     tags: [Teams]
 *     summary: List all teams
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of teams
 */
router.get('/', listTeams);

/**
 * @openapi
 * /api/teams:
 *   post:
 *     tags: [Teams]
 *     summary: Create a team
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Engineering
 *               idleThresholdSecs:
 *                 type: integer
 *                 example: 60
 *     responses:
 *       201:
 *         description: Team created
 */
router.post(
  '/',
  requireRole('admin'),
  validate({ body: createTeamSchema }),
  createTeam
);

/**
 * @openapi
 * /api/teams/{id}:
 *   patch:
 *     tags: [Teams]
 *     summary: Update a team
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               idleThresholdSecs:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Team updated
 */
router.patch(
  '/:id',
  requireRole('admin'),
  validate({ body: updateTeamSchema, params: idParamSchema }),
  updateTeam
);

/**
 * @openapi
 * /api/teams/{id}:
 *   delete:
 *     tags: [Teams]
 *     summary: Delete a team
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
 *         description: Team deleted
 */
router.delete(
  '/:id',
  requireRole('admin'),
  validate({ params: idParamSchema }),
  deleteTeam
);

export default router;
