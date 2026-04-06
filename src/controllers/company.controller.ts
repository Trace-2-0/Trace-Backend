import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// ────────────────────────────────────────────────────────────
// GET /api/company
// ────────────────────────────────────────────────────────────
export async function getCompany(req: Request, res: Response) {
  const { companyId } = req.user!;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      plan: true,
      trialStartsAt: true,
      trialEndsAt: true,
      isActive: true,
      maxEmployees: true,
      createdAt: true,
      _count: { select: { users: true, teams: true } },
    },
  });

  if (!company) {
    res.status(404).json({ error: 'Company not found' });
    return;
  }

  res.json({ company });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/company
// ────────────────────────────────────────────────────────────
export async function updateCompany(req: Request, res: Response) {
  const { companyId } = req.user!;
  const { name, maxEmployees } = req.body;

  const updated = await prisma.company.update({
    where: { id: companyId },
    data: {
      ...(name !== undefined && { name }),
      ...(maxEmployees !== undefined && { maxEmployees }),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      plan: true,
      maxEmployees: true,
    },
  });

  res.json({ company: updated });
}
