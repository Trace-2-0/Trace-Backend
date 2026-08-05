import { Request, Response } from 'express';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { prisma } from '../lib/prisma';
import { sseManager } from '../lib/sse';
import { logAudit } from '../services/audit.service';
import { getActiveShift, computeShiftTotals } from '../services/shift.service';
import { uploadToR2, compressToWebP, buildStorageKey, isR2Configured } from '../services/r2.service';
import { addScreenshotJob } from '../queues/screenshotQueue';
import { redis } from '../lib/redis';

// ────────────────────────────────────────────────────────────
// POST /api/agent/clock-in
// ────────────────────────────────────────────────────────────
export async function clockIn(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;
  const { deviceOs } = req.body;

  // Check for existing active shift
  const existing = await getActiveShift(userId, companyId);
  if (existing) {
    res.status(409).json({ error: 'Already clocked in', shiftId: existing.id });
    return;
  }

  // Check late threshold
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
  });

  const now = new Date();
  let isLate = false;
  if (settings?.lateThresholdTime) {
    const [h, m] = settings.lateThresholdTime.split(':').map(Number);
    const threshold = new Date(now);
    threshold.setHours(h, m, 0, 0);
    isLate = now > threshold;
  }

  // Date-only for the date field
  const dateOnly = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const shift = await prisma.shift.create({
    data: {
      companyId,
      userId,
      date: dateOnly,
      startTime: now,
      isLate,
      deviceOs: deviceOs || null,
      lastHeartbeatAt: now,
    },
  });

  sseManager.broadcast(companyId, 'shift.clock_in', {
    userId,
    shiftId: shift.id,
    startTime: shift.startTime,
    isLate,
  });

  logAudit({
    companyId,
    actorId: userId,
    actorType: 'agent',
    action: 'shift.clock_in',
    targetId: shift.id,
    targetType: 'shift',
    meta: { deviceOs, isLate },
  });

  res.status(201).json({ shift });
}

// ────────────────────────────────────────────────────────────
// POST /api/agent/clock-out
// ────────────────────────────────────────────────────────────
export async function clockOut(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;
  const { checkoutType, checkoutReason } = req.body;

  const activeShift = await getActiveShift(userId, companyId);
  if (!activeShift) {
    res.status(400).json({ error: 'No active shift to clock out' });
    return;
  }

  const now = new Date();

  // End any active break first
  const activeBreak = await prisma.break.findFirst({
    where: { shiftId: activeShift.id, endTime: null },
  });
  if (activeBreak) {
    const breakDuration = Math.floor(
      (now.getTime() - activeBreak.startTime.getTime()) / 1000
    );
    await prisma.break.update({
      where: { id: activeBreak.id },
      data: { endTime: now, durationSecs: breakDuration },
    });
  }

  // Update shift with end time
  await prisma.shift.update({
    where: { id: activeShift.id },
    data: {
      endTime: now,
      checkoutType: checkoutType || 'manual',
      checkoutReason: checkoutReason || null,
    },
  });

  // Recompute totals
  const updatedShift = await computeShiftTotals(activeShift.id);

  sseManager.broadcast(companyId, 'shift.clock_out', {
    userId,
    shiftId: activeShift.id,
    endTime: now,
    checkoutType,
    totalWorkSecs: updatedShift?.totalWorkSecs,
    totalActiveSecs: updatedShift?.totalActiveSecs,
  });

  logAudit({
    companyId,
    actorId: userId,
    actorType: 'agent',
    action: 'shift.clock_out',
    targetId: activeShift.id,
    targetType: 'shift',
    meta: { checkoutType, checkoutReason },
  });

  res.json({ shift: updatedShift });
}

// ────────────────────────────────────────────────────────────
// POST /api/agent/heartbeat
// ────────────────────────────────────────────────────────────
export async function heartbeat(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;

  // 1. Check Redis RAM for active shift ID (< 1ms lookup)
  let shiftId: string | null = null;
  try {
    shiftId = await redis.get(`active_shift:${userId}`);
  } catch (err: any) {
    // Fallback to DB if Redis is unreachable
  }

  // 2. If missing in Redis, query DB and populate Redis
  if (!shiftId) {
    const activeShift = await getActiveShift(userId, companyId);
    if (!activeShift) {
      res.status(400).json({ error: 'No active shift' });
      return;
    }
    shiftId = activeShift.id;
    try {
      await redis.set(`active_shift:${userId}`, shiftId);
    } catch (err: any) {}
  }

  const now = new Date();
  await prisma.shift.update({
    where: { id: shiftId },
    data: { lastHeartbeatAt: now },
  });

  sseManager.broadcast(companyId, 'heartbeat', {
    userId,
    shiftId,
    timestamp: now,
  });

  res.json({ ok: true, shiftId, timestamp: now });
}

// ────────────────────────────────────────────────────────────
// POST /api/agent/break/start
// ────────────────────────────────────────────────────────────
export async function breakStart(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;

  const activeShift = await getActiveShift(userId, companyId);
  if (!activeShift) {
    res.status(400).json({ error: 'No active shift' });
    return;
  }

  // Check if already on a break
  const existingBreak = await prisma.break.findFirst({
    where: { shiftId: activeShift.id, endTime: null },
  });
  if (existingBreak) {
    res.status(409).json({ error: 'Already on a break', breakId: existingBreak.id });
    return;
  }

  // Check max breaks per shift
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
  });
  const breakCount = await prisma.break.count({
    where: { shiftId: activeShift.id },
  });
  if (settings && breakCount >= settings.maxBreaksPerShift) {
    res.status(400).json({
      error: `Maximum breaks per shift reached (${settings.maxBreaksPerShift})`,
    });
    return;
  }

  const newBreak = await prisma.break.create({
    data: {
      companyId,
      shiftId: activeShift.id,
      startTime: new Date(),
    },
  });

  sseManager.broadcast(companyId, 'break.start', {
    userId,
    shiftId: activeShift.id,
    breakId: newBreak.id,
  });

  logAudit({
    companyId,
    actorId: userId,
    actorType: 'agent',
    action: 'break.start',
    targetId: newBreak.id,
    targetType: 'break',
  });

  res.status(201).json({ break: newBreak });
}

// ────────────────────────────────────────────────────────────
// POST /api/agent/break/end
// ────────────────────────────────────────────────────────────
export async function breakEnd(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;

  const activeShift = await getActiveShift(userId, companyId);
  if (!activeShift) {
    res.status(400).json({ error: 'No active shift' });
    return;
  }

  const activeBreak = await prisma.break.findFirst({
    where: { shiftId: activeShift.id, endTime: null },
  });
  if (!activeBreak) {
    res.status(400).json({ error: 'No active break to end' });
    return;
  }

  const now = new Date();
  const durationSecs = Math.floor(
    (now.getTime() - activeBreak.startTime.getTime()) / 1000
  );

  const updatedBreak = await prisma.break.update({
    where: { id: activeBreak.id },
    data: { endTime: now, durationSecs },
  });

  // Recompute shift totals
  await computeShiftTotals(activeShift.id);

  sseManager.broadcast(companyId, 'break.end', {
    userId,
    shiftId: activeShift.id,
    breakId: activeBreak.id,
    durationSecs,
  });

  logAudit({
    companyId,
    actorId: userId,
    actorType: 'agent',
    action: 'break.end',
    targetId: activeBreak.id,
    targetType: 'break',
    meta: { durationSecs },
  });

  res.json({ break: updatedBreak });
}

// ────────────────────────────────────────────────────────────
// POST /api/agent/idle
// ────────────────────────────────────────────────────────────
export async function reportIdle(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;
  const { startTime, endTime, durationSecs } = req.body;

  const activeShift = await getActiveShift(userId, companyId);
  if (!activeShift) {
    res.status(400).json({ error: 'No active shift' });
    return;
  }

  const idleSession = await prisma.idleSession.create({
    data: {
      companyId,
      shiftId: activeShift.id,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      durationSecs,
    },
  });

  // Recompute shift totals
  await computeShiftTotals(activeShift.id);

  sseManager.broadcast(companyId, 'idle.reported', {
    userId,
    shiftId: activeShift.id,
    idleSessionId: idleSession.id,
    durationSecs,
  });

  logAudit({
    companyId,
    actorId: userId,
    actorType: 'agent',
    action: 'idle.reported',
    targetId: idleSession.id,
    targetType: 'idle_session',
    meta: { durationSecs },
  });

  res.status(201).json({ idleSession });
}

// ────────────────────────────────────────────────────────────
// POST /api/agent/screenshot
// ────────────────────────────────────────────────────────────
export async function uploadScreenshot(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;
  const { imageBase64, capturedAt } = req.body;

  const activeShift = await getActiveShift(userId, companyId);
  if (!activeShift) {
    res.status(400).json({ error: 'No active shift' });
    return;
  }

  // Offload heavy image decoding, compression, and R2/disk upload to BullMQ Redis Queue
  const job = await addScreenshotJob({
    companyId,
    userId,
    shiftId: activeShift.id,
    base64Image: imageBase64,
    timestamp: capturedAt || new Date().toISOString(),
  });

  // Return HTTP 202 Accepted immediately in < 5ms
  res.status(202).json({
    message: 'Screenshot queued for background processing',
    jobId: job.id,
    shiftId: activeShift.id,
  });
  logAudit({
    companyId,
    actorId: userId,
    actorType: 'agent',
    action: 'screenshot.queued',
    targetId: job.id || 'job',
    targetType: 'screenshot_job',
    meta: { jobId: job.id },
  });
}

// ────────────────────────────────────────────────────────────
// POST /api/agent/app-usage/sync
// ────────────────────────────────────────────────────────────
export async function syncAppUsage(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;
  const { usage, active } = req.body;
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const userName = user?.name || userId;

  const activeAppName = active ? (active.title || active.name) : 'None';
  const bgApps = usage ? usage.filter((u: any) => u.name !== (active ? active.name : '')).map((u: any) => u.name) : [];
  
  console.log(`\n[Backend]`);
  console.log(`Foreground app use of user : ${userName} -> ${activeAppName}`);
  console.log(`Background : ${bgApps.length > 0 ? bgApps.join(', ') : 'None'} . . .`);

  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  // Get all app tags for this company (for copying tag at write-time)
  const appTags = await prisma.appTag.findMany({ where: { companyId } });
  const tagMap = new Map(
    appTags.map((t) => [t.appName.toLowerCase(), t.tag])
  );

  const upserts = usage.map(
    (app: { name: string; seconds: number }) => {
      const tag = tagMap.get(app.name.toLowerCase()) || 'neutral';
      return prisma.dailyAppUsage.upsert({
        where: {
          companyId_userId_appName_date: {
            companyId,
            userId,
            appName: app.name,
            date: today,
          },
        },
        update: { activeSecs: app.seconds },
        create: {
          companyId,
          userId,
          date: today,
          appName: app.name,
          activeSecs: app.seconds,
          tag,
        },
      });
    }
  );

  await prisma.$transaction(upserts);

  res.json({ synced: usage.length, date: today.toISOString().split('T')[0] });
}

// ────────────────────────────────────────────────────────────
// GET /api/agent/status
// ────────────────────────────────────────────────────────────
export async function getStatus(req: Request, res: Response) {
  const { userId, companyId, teamId } = req.agentUser!;

  const activeShift = await getActiveShift(userId, companyId);

  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
  });

  // Get team-level idle threshold if user has a team
  let idleThresholdSecs = 300; // default
  if (teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { idleThresholdSecs: true },
    });
    if (team) idleThresholdSecs = team.idleThresholdSecs;
  }

  let activeBreak = null;
  if (activeShift) {
    activeBreak = await prisma.break.findFirst({
      where: { shiftId: activeShift.id, endTime: null },
    });
  }

  res.json({
    shift: activeShift
      ? {
        id: activeShift.id,
        startTime: activeShift.startTime,
        isLate: activeShift.isLate,
        totalWorkSecs: activeShift.totalWorkSecs,
        totalBreakSecs: activeShift.totalBreakSecs,
        totalIdleSecs: activeShift.totalIdleSecs,
      }
      : null,
    isOnBreak: !!activeBreak,
    activeBreakId: activeBreak?.id || null,
    settings: settings
      ? {
        screenshotIntervalSecs: settings.screenshotIntervalSecs,
        heartbeatGraceSecs: settings.heartbeatGraceSecs,
        blurScreenshotsOnBreak: settings.blurScreenshotsOnBreak,
        maxBreaksPerShift: settings.maxBreaksPerShift,
        maxBreakDurationSecs: settings.maxBreakDurationSecs,
        expectedWorkSecs: settings.expectedWorkSecs,
        expectedActiveSecs: settings.expectedActiveSecs,
      }
      : null,
    idleThresholdSecs,
  });
}

// ────────────────────────────────────────────────────────────
// POST /api/agent/disconnect
// ────────────────────────────────────────────────────────────
export async function disconnectIntent(req: Request, res: Response) {
  const { userId, companyId } = req.agentUser!;
  const { reason, disconnectedAt } = req.body;

  const activeShift = await getActiveShift(userId, companyId);
  if (!activeShift) {
    res.json({ ok: true, message: 'No active shift — nothing to do' });
    return;
  }

  const disconnectTime = disconnectedAt
    ? new Date(disconnectedAt)
    : new Date();

  if (reason === 'manual_quit') {
    // End any active break first
    const activeBreak = await prisma.break.findFirst({
      where: { shiftId: activeShift.id, endTime: null },
    });
    if (activeBreak) {
      const breakDuration = Math.floor(
        (disconnectTime.getTime() - activeBreak.startTime.getTime()) / 1000
      );
      await prisma.break.update({
        where: { id: activeBreak.id },
        data: { endTime: disconnectTime, durationSecs: Math.max(0, breakDuration) },
      });
    }

    // Update shift with end time
    await prisma.shift.update({
      where: { id: activeShift.id },
      data: {
        endTime: disconnectTime,
        checkoutType: 'manual_quit',
      },
    });

    const updatedShift = await computeShiftTotals(activeShift.id);

    sseManager.broadcast(companyId, 'shift.clock_out', {
      userId,
      shiftId: activeShift.id,
      endTime: disconnectTime,
      checkoutType: 'manual_quit',
      totalWorkSecs: updatedShift?.totalWorkSecs,
      totalActiveSecs: updatedShift?.totalActiveSecs,
    });
  } else {
    await prisma.shift.update({
      where: { id: activeShift.id },
      data: {
        disconnectAt: disconnectTime,
        checkoutType: reason === 'system_shutdown' ? 'shutdown' : 'powercut',
      },
    });
  }

  logAudit({
    companyId,
    actorId: userId,
    actorType: 'agent',
    action: 'shift.disconnect_intent',
    targetId: activeShift.id,
    targetType: 'shift',
    meta: { reason, disconnectedAt: disconnectTime },
  });

  res.json({ ok: true, shiftId: activeShift.id });
}
