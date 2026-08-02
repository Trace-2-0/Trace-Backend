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
  const {
    expectedWorkSecs,
    expectedActiveSecs,
    maxBreaksPerShift,
    maxBreakDurationSecs,
    lateThresholdTime,
    screenshotIntervalSecs,
    blurScreenshotsOnBreak,
  } = req.body;

  const data: any = {};
  if (expectedWorkSecs !== undefined) data.expectedWorkSecs = Number(expectedWorkSecs);
  if (expectedActiveSecs !== undefined) data.expectedActiveSecs = Number(expectedActiveSecs);
  if (maxBreaksPerShift !== undefined) data.maxBreaksPerShift = Number(maxBreaksPerShift);
  if (maxBreakDurationSecs !== undefined) data.maxBreakDurationSecs = Number(maxBreakDurationSecs);
  if (lateThresholdTime !== undefined) data.lateThresholdTime = String(lateThresholdTime);
  if (screenshotIntervalSecs !== undefined) data.screenshotIntervalSecs = Number(screenshotIntervalSecs);
  if (blurScreenshotsOnBreak !== undefined) data.blurScreenshotsOnBreak = Boolean(blurScreenshotsOnBreak);

  const settings = await prisma.companySettings.upsert({
    where: { companyId },
    update: data,
    create: { companyId, ...data },
  });

  res.json({ settings });
}
