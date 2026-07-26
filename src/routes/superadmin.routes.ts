import { Router } from 'express';
import { getAllCompanies, toggleCompanySuspension } from '../controllers/superadmin.controller';

const router = Router();

/**
 * @openapi
 * /api/superadmin/companies:
 *   get:
 *     tags: [Superadmin]
 *     summary: Retrieve all companies with user counts and user details
 *     responses:
 *       200:
 *         description: List of all registered companies
 */
router.get('/companies', getAllCompanies);

/**
 * @openapi
 * /api/superadmin/companies/{id}/suspend:
 *   patch:
 *     tags: [Superadmin]
 *     summary: Suspend or reactivate a company
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *               suspendedReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Company status updated successfully
 *       404:
 *         description: Company not found
 */
router.patch('/companies/:id/suspend', toggleCompanySuspension);

export default router;
