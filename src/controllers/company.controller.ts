import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

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

// ────────────────────────────────────────────────────────────
// GET /api/company/dashboard/stats
// ────────────────────────────────────────────────────────────
export async function getDashboardStats(req: Request, res: Response) {
  const { companyId } = req.user!;
  const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];

  // 1. Check Redis RAM Cache (Sub-15ms execution)
  const cacheKey = `company:dashboard:stats:${companyId}:${dateStr}`;
  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      res.json(JSON.parse(cachedData));
      return;
    }
  } catch (err: any) {
    // If Redis fails, gracefully fall through to DB query
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Get all users (exclude admins)
  const allUsers = await prisma.user.findMany({
    where: { companyId, isActive: true, role: { not: 'admin' } },
    select: { id: true, name: true, email: true, team: { select: { id: true, name: true } } },
  });

  // Get today's shifts
  const todayShifts = await prisma.shift.findMany({
    where: { companyId, date: startOfDay },
    include: {
      breaks: { where: { endTime: null } }
    }
  });

  let activeNow = 0;
  let onBreak = 0;
  let clockedOutToday = 0;
  let lateToday = 0;

  const usersWithStatus = allUsers.map(user => {
    const shift = todayShifts.find(s => s.userId === user.id);
    let currentStatus = 'absent';
    let clockInTime = undefined;

    if (shift) {
      clockInTime = shift.startTime;
      if (shift.isLate) lateToday++;

      if (shift.endTime) {
        currentStatus = 'clocked_out';
        clockedOutToday++;
      } else if (shift.breaks.length > 0) {
        currentStatus = 'on_break';
        onBreak++;
      } else {
        currentStatus = 'working';
        activeNow++;
      }
    }

    return { ...user, currentStatus, clockInTime };
  });

  const absentToday = allUsers.length - todayShifts.length;
  // @ts-ignore
  const lateUsers = usersWithStatus.filter(u => todayShifts.find(s => s.userId === u.id)?.isLate);

  // Teams aggregation
  const allTeams = await prisma.team.findMany({ where: { companyId } });
  const teams = allTeams.map(t => {
    const tUsers = usersWithStatus.filter(u => u.team?.id === t.id);
    return {
      id: t.id,
      name: t.name,
      working: tUsers.filter(u => u.currentStatus === 'working').length,
      onBreak: tUsers.filter(u => u.currentStatus === 'on_break').length,
      clockedOut: tUsers.filter(u => u.currentStatus === 'clocked_out').length,
      absent: tUsers.filter(u => u.currentStatus === 'absent').length,
    };
  });

  const responsePayload = {
    totalEmployees: allUsers.length,
    activeNow,
    onBreak,
    clockedOutToday,
    absentToday,
    lateToday,
    users: usersWithStatus,
    lateUsers,
    teams
  };

  // 2. Set Cache with 300 Seconds (5 Mins) TTL in Redis RAM
  try {
    await redis.setex(cacheKey, 300, JSON.stringify(responsePayload));
  } catch (err: any) {
    // Graceful Redis write error handling
  }

  res.json(responsePayload);
}

