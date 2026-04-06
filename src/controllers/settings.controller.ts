import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// ────────────────────────────────────────────────────────────
// GET /api/settings
// ────────────────────────────────────────────────────────────
export async function getSettings(req: Request, res: Response) {
  const { companyId } = req.user!;

  let settings = await prisma.companySettings.findUnique({
    where: { companyId },
  });

  // Auto-create defaults if not exists
  if (!settings) {
    settings = await prisma.companySettings.create({
      data: { companyId },
    });
  }

  res.json({ settings });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/settings
// ────────────────────────────────────────────────────────────
export async function updateSettings(req: Request, res: Response) {
  const { companyId } = req.user!;

  const settings = await prisma.companySettings.upsert({
    where: { companyId },
    update: req.body,
    create: { companyId, ...req.body },
  });

  res.json({ settings });
}
