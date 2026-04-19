import { Router } from 'express';
import { validate } from '../middleware/validate';
import {
  companyRegisterSchema,
  companyLoginSchema,
  userLoginSchema,
} from '../validators/schemas';
import {
  registerCompany,
  loginCompany,
  loginUser,
  getAllCompanies
} from '../controllers/auth.controller';

const router = Router();

/**
 * @openapi
 * /api/auth/company/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new company + admin user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, adminName]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Acme Corp
 *               email:
 *                 type: string
 *                 example: admin@acme.com
 *               password:
 *                 type: string
 *                 example: securepass123
 *               adminName:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: Company registered successfully
 *       409:
 *         description: Duplicate email or slug
 */
router.post(
  '/company/register',
  validate({ body: companyRegisterSchema }),
  registerCompany
);

/**
 * @openapi
 * /api/auth/company/login:
 *   post:
 *     tags: [Auth]
 *     summary: Company admin login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@acme.com
 *               password:
 *                 type: string
 *                 example: securepass123
 *     responses:
 *       200:
 *         description: Login successful — returns JWT
 *       401:
 *         description: Invalid credentials
 */
router.post(
  '/company/login',
  validate({ body: companyLoginSchema }),
  loginCompany
);

/**
 * @openapi
 * /api/auth/user/login:
 *   post:
 *     tags: [Auth]
 *     summary: Employee/Manager login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               companySlug:
 *                 type: string
 *                 example: acme-corp
 *               companyId:
 *                 type: string
 *                 example: cmr123xyz...
 *               email:
 *                 type: string
 *                 example: employee@acme.com
 *               password:
 *                 type: string
 *                 example: pass1234
 *     responses:
 *       200:
 *         description: Login successful — returns JWT + agentToken
 *       401:
 *         description: Invalid credentials
 */
router.post(
  '/user/login',
  validate({ body: userLoginSchema }),
  loginUser
);

/**
 * @openapi
 * /api/auth/companies:
 *   get:
 *     tags: [Auth]
 *     summary: Retrieve all registered companies and their admins (Testing Endpoint)
 *     responses:
 *       200:
 *         description: List of all companies
 */
router.get(
  '/companies',
  getAllCompanies
);

export default router;
