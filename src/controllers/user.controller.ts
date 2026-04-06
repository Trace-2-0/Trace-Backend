import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logAudit } from '../services/audit.service';

// ────────────────────────────────────────────────────────────
// GET /api/users
// ────────────────────────────────────────────────────────────
export async function listUsers(req: Request, res: Response) {
  const { companyId } = req.user!;
  const { teamId, role, active } = req.query;

  const where: any = { companyId };
  if (teamId) where.teamId = teamId;
  if (role) where.role = role;
  if (active !== undefined) where.isActive = active === 'true';

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamId: true,
      isActive: true,
      agentToken: true,
      createdAt: true,
      team: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });

  res.json({ users });
}

// ────────────────────────────────────────────────────────────
// POST /api/users
// ────────────────────────────────────────────────────────────
export async function createUser(req: Request, res: Response) {
  const { companyId } = req.user!;
  const { email, name, password, role, teamId } = req.body;

  // Check employee limit
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { maxEmployees: true },
  });
  const currentCount = await prisma.user.count({
    where: { companyId, isActive: true },
  });
  if (company && currentCount >= company.maxEmployees) {
    res.status(400).json({
      error: `Employee limit reached (${company.maxEmployees}). Upgrade your plan.`,
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const agentToken = crypto.randomBytes(32).toString('hex');

  const user = await prisma.user.create({
    data: {
      companyId,
      email,
      name,
      passwordHash,
      role: role || 'employee',
      teamId: teamId || null,
      agentToken,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamId: true,
      agentToken: true,
      createdAt: true,
    },
  });

  logAudit({
    companyId,
    actorId: req.user!.userId,
    actorType: 'admin',
    action: 'user.created',
    targetId: user.id,
    targetType: 'user',
  });

  res.status(201).json({ user });
}

// ────────────────────────────────────────────────────────────
// PATCH /api/users/:id
// ────────────────────────────────────────────────────────────
export async function updateUser(req: Request, res: Response) {
  const { companyId } = req.user!;
  const id = req.params.id as string;
  const { name, role, teamId, isActive } = req.body;

  const data: any = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (teamId !== undefined) data.teamId = teamId;
  if (isActive !== undefined) {
    data.isActive = isActive;
    if (!isActive) data.deactivatedAt = new Date();
  }

  const user = await prisma.user.update({
    where: { id, companyId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamId: true,
      isActive: true,
      deactivatedAt: true,
    },
  });

  logAudit({
    companyId,
    actorId: req.user!.userId,
    actorType: 'admin',
    action: 'user.updated',
    targetId: id,
    targetType: 'user',
    meta: data,
  });

  res.json({ user });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/users/:id  (soft-delete = deactivate)
// ────────────────────────────────────────────────────────────
export async function deactivateUser(req: Request, res: Response) {
  const { companyId } = req.user!;
  const id = req.params.id as string;

  const user = await prisma.user.update({
    where: { id, companyId },
    data: { isActive: false, deactivatedAt: new Date() },
  });

  logAudit({
    companyId,
    actorId: req.user!.userId,
    actorType: 'admin',
    action: 'user.deactivated',
    targetId: id,
    targetType: 'user',
  });

  res.json({ ok: true, userId: user.id });
}

// ────────────────────────────────────────────────────────────
// DELETE /api/users/:id/permanent
// ────────────────────────────────────────────────────────────
export async function deleteUserPermanent(req: Request, res: Response) {
  const { companyId } = req.user!;
  const id = req.params.id as string;

  await prisma.user.delete({
    where: { id, companyId },
  });

  logAudit({
    companyId,
    actorId: req.user!.userId,
    actorType: 'admin',
    action: 'user.deleted_permanent',
    targetId: id,
    targetType: 'user',
  });

  res.json({ ok: true, deletedPermanent: id });
}

// ────────────────────────────────────────────────────────────
// POST /api/users/:id/regenerate-token
// ────────────────────────────────────────────────────────────
export async function regenerateToken(req: Request, res: Response) {
  const { companyId } = req.user!;
  const id = req.params.id as string;

  const newToken = crypto.randomBytes(32).toString('hex');

  const user = await prisma.user.update({
    where: { id, companyId },
    data: { agentToken: newToken },
    select: { id: true, name: true, agentToken: true },
  });

  logAudit({
    companyId,
    actorId: req.user!.userId,
    actorType: 'admin',
    action: 'user.token_regenerated',
    targetId: id,
    targetType: 'user',
  });

  res.json({ user });
}
