import { Router } from 'express';
import { jwtAuth, requireRole } from '../middleware/jwtAuth';
import { validate } from '../middleware/validate';
import {
  createUserSchema,
  updateUserSchema,
  idParamSchema,
} from '../validators/schemas';
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  deleteUserPermanent,
  regenerateToken,
} from '../controllers/user.controller';
import { checkEmployeeLimit } from '../middleware/subscriptionAuth';

const router = Router();
router.use(jwtAuth);

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users (with optional filters)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: teamId
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, manager, employee]
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', listUsers);

/**
 * @openapi
 * /api/users:
 *   post:
 *     tags: [Users]
 *     summary: Create a new user (generates agentToken)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, name, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: dev@acme.com
 *               name:
 *                 type: string
 *                 example: Jane Smith
 *               password:
 *                 type: string
 *                 example: pass12345
 *               role:
 *                 type: string
 *                 enum: [admin, manager, employee]
 *                 default: employee
 *               teamId:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created (includes agentToken)
 */
router.post(
  '/',
  requireRole('admin'),
  validate({ body: createUserSchema }),
  checkEmployeeLimit,
  createUser
);

/**
 * @openapi
 * /api/users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update a user
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
 *               role:
 *                 type: string
 *               teamId:
 *                 type: string
 *                 nullable: true
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated
 */
router.patch(
  '/:id',
  requireRole('admin'),
  validate({ body: updateUserSchema, params: idParamSchema }),
  updateUser
);

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Deactivate a user (soft delete)
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
 *         description: User deactivated
 */
router.delete(
  '/:id',
  requireRole('admin'),
  validate({ params: idParamSchema }),
  deactivateUser
);

/**
 * @openapi
 * /api/users/{id}/permanent:
 *   delete:
 *     tags: [Users]
 *     summary: Permanently delete a user
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
 *         description: User permanently deleted
 */
router.delete(
  '/:id/permanent',
  requireRole('admin'),
  validate({ params: idParamSchema }),
  deleteUserPermanent
);

/**
 * @openapi
 * /api/users/{id}/regenerate-token:
 *   post:
 *     tags: [Users]
 *     summary: Regenerate agent token for a user
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
 *         description: New agent token generated
 */
router.post(
  '/:id/regenerate-token',
  requireRole('admin'),
  validate({ params: idParamSchema }),
  regenerateToken
);

export default router;
