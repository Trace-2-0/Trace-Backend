import { Router } from 'express';
import { jwtAuth, requireRole } from '../middleware/jwtAuth';
import { validate } from '../middleware/validate';
import { updateCompanySchema } from '../validators/schemas';
import { getCompany, updateCompany } from '../controllers/company.controller';

const router = Router();
router.use(jwtAuth);

/**
 * @openapi
 * /api/company:
 *   get:
 *     tags: [Company]
 *     summary: Get company details
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Company details
 */
router.get('/', getCompany);

/**
 * @openapi
 * /api/company:
 *   patch:
 *     tags: [Company]
 *     summary: Update company details
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               maxEmployees:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Company updated
 */
router.patch(
  '/',
  requireRole('admin'),
  validate({ body: updateCompanySchema }),
  updateCompany
);

export default router;
