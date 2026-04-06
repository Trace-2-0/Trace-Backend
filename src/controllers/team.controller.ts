import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// ────────────────────────────────────────────────────────────
// GET /api/teams
// ────────────────────────────────────────────────────────────
export async function listTeams(req: Request, res: Response) {
  const { companyId } = req.user!;

  const teams = await prisma.team.findMany({
    where: { companyId },
    include: {
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  });

  res.json({ teams });
}

// ────────────────────────────────────────────────────────────
// POST /api/teams
// ────────────────────────────────────────────────────────────
export async function createTeam(req: Request, res: Response) {
  const { companyId } = req.user!;
  const { name, idleThresholdSecs } = req.body;

  const team = await prisma.team.create({
    data: {
      companyId,
      name,
      ...(idleThresholdSecs !== undefined && { idleThresholdSecs }),
    },
  });

  res.status(201).json({ team });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/teams/:id
// ────────────────────────────────────────────────────────────
export async function updateTeam(req: Request, res: Response) {
  const { companyId } = req.user!;
  const id = req.params.id as string;
  const { name, idleThresholdSecs } = req.body;

  const team = await prisma.team.update({
    where: { id, companyId },
    data: {
      ...(name !== undefined && { name }),
      ...(idleThresholdSecs !== undefined && { idleThresholdSecs }),
    },
  });

  res.json({ team });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/teams/:id
// ────────────────────────────────────────────────────────────
export async function deleteTeam(req: Request, res: Response) {
  const { companyId } = req.user!;
  const id = req.params.id as string;

  await prisma.team.delete({
    where: { id, companyId },
  });

  res.json({ ok: true, deleted: id });
}
