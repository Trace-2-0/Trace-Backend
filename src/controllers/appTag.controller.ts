import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// ────────────────────────────────────────────────────────────
// GET /api/app-tags
// ────────────────────────────────────────────────────────────
export async function listAppTags(req: Request, res: Response) {
  const { companyId } = req.user!;

  const appTags = await prisma.appTag.findMany({
    where: { companyId },
    orderBy: { appName: 'asc' },
  });

  res.json({ appTags });
}

// ────────────────────────────────────────────────────────────
// PUT /api/app-tags
// ────────────────────────────────────────────────────────────
export async function upsertAppTag(req: Request, res: Response) {
  const { companyId } = req.user!;
  const { appName, tag } = req.body;

  const appTag = await prisma.appTag.upsert({
    where: {
      companyId_appName: { companyId, appName },
    },
    update: { tag },
    create: { companyId, appName, tag },
  });

  res.json({ appTag });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/app-tags/:id
// ────────────────────────────────────────────────────────────
export async function deleteAppTag(req: Request, res: Response) {
  const { companyId } = req.user!;
  const id = req.params.id as string;

  await prisma.appTag.delete({
    where: { id, companyId },
  });

  res.json({ ok: true, deleted: id });
}
