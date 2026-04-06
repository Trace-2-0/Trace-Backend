import { prisma } from '../lib/prisma';

// ────────────────────────────────────────────────────────────
// Shift Service
// Helpers for shift lifecycle and computation
// ────────────────────────────────────────────────────────────

/**
 * Find the active (ongoing) shift for a user
 */
export async function getActiveShift(userId: string, companyId: string) {
  return prisma.shift.findFirst({
    where: {
      userId,
      companyId,
      endTime: null,
    },
    orderBy: { startTime: 'desc' },
  });
}

/**
 * Recompute all duration fields on a shift from its breaks and idle sessions.
 * Called on clock-out, break-end, idle-report.
 */
export async function computeShiftTotals(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      breaks: true,
      idleSessions: true,
      company: {
        include: { settings: true },
      },
    },
  });

  if (!shift) return null;

  const now = new Date();
  const endTime = shift.endTime || now;
  const totalWorkSecs = Math.floor(
    (endTime.getTime() - shift.startTime.getTime()) / 1000
  );

  // Sum break durations
  const totalBreakSecs = shift.breaks.reduce((sum, b) => {
    if (b.endTime) {
      return sum + b.durationSecs;
    }
    // If break is still active, compute live duration
    return sum + Math.floor((now.getTime() - b.startTime.getTime()) / 1000);
  }, 0);

  // Sum idle durations
  const totalIdleSecs = shift.idleSessions.reduce(
    (sum, i) => sum + i.durationSecs,
    0
  );

  // Active time = total work - breaks - idle
  const totalActiveSecs = Math.max(0, totalWorkSecs - totalBreakSecs - totalIdleSecs);

  // Overtime = totalWork - expectedWork (from settings)
  const expectedWorkSecs = shift.company.settings?.expectedWorkSecs || 28800;
  const overtimeSecs = Math.max(0, totalWorkSecs - expectedWorkSecs);

  const updated = await prisma.shift.update({
    where: { id: shiftId },
    data: {
      totalWorkSecs,
      totalBreakSecs,
      totalIdleSecs,
      totalActiveSecs,
      overtimeSecs,
    },
  });

  return updated;
}
