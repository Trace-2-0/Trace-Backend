import { prisma } from '../lib/prisma';
import { computeShiftTotals } from '../services/shift.service';
import { logAudit } from '../services/audit.service';
import { sseManager } from '../lib/sse';

const SWEEP_INTERVAL_MS = 60_000; // Check every minute

export function startShiftSweep() {
  console.log('[Cron] Shift sweep initialized (runs every 60s)');
  
  setInterval(async () => {
    try {
      // Find all shifts that haven't ended but have a heartbeat
      const staleCandidates = await prisma.shift.findMany({
        where: {
          endTime: null,
          lastHeartbeatAt: { not: null }
        },
        include: {
          company: {
            include: { settings: true }
          }
        }
      });

      if (staleCandidates.length === 0) return;

      const now = new Date();

      for (const shift of staleCandidates) {
        // Default grace period: 90 minutes (5400s)
        const graceSecs = shift.company.settings?.heartbeatGraceSecs ?? 5400;
        const lastHeartbeat = shift.lastHeartbeatAt!;
        
        const isStale = (now.getTime() - lastHeartbeat.getTime()) > (graceSecs * 1000);
        
        if (isStale) {
          // Determine the end time: if there was an explicit disconnect intent, use that,
          // otherwise fallback to the last heartbeat.
          const effectiveEndTime = shift.disconnectAt ?? lastHeartbeat;
          const checkoutType = shift.checkoutType === 'shutdown' || shift.checkoutType === 'powercut'
            ? shift.checkoutType
            : 'heartbeat_timeout';

          // First, close any active break for this shift
          const activeBreak = await prisma.break.findFirst({
            where: { shiftId: shift.id, endTime: null }
          });

          if (activeBreak) {
            const breakDuration = Math.floor((effectiveEndTime.getTime() - activeBreak.startTime.getTime()) / 1000);
            await prisma.break.update({
              where: { id: activeBreak.id },
              // If the effective end time is before the break start time (corner case), clamp to 0
              data: { 
                endTime: effectiveEndTime, 
                durationSecs: Math.max(0, breakDuration) 
              }
            });
          }

          // Force-close the shift
          await prisma.shift.update({
            where: { id: shift.id },
            data: {
              endTime: effectiveEndTime,
              checkoutType: checkoutType,
            }
          });

          // Recompute totals based on the effective end time
          const updatedShift = await computeShiftTotals(shift.id);

          sseManager.broadcast(shift.companyId, 'shift.clock_out', {
            userId: shift.userId,
            shiftId: shift.id,
            endTime: effectiveEndTime,
            checkoutType,
            totalWorkSecs: updatedShift?.totalWorkSecs,
            totalActiveSecs: updatedShift?.totalActiveSecs,
          });

          logAudit({
            companyId: shift.companyId,
            actorId: null, // System action
            actorType: 'system',
            action: 'shift.auto_checkout',
            targetId: shift.id,
            targetType: 'shift',
            meta: { checkoutType, lastHeartbeatAt: lastHeartbeat, effectiveEndTime, graceAppliedSecs: graceSecs }
          });

          console.log(`[Cron] Auto-closed shift ${shift.id} for user ${shift.userId} (stale since ${lastHeartbeat.toISOString()})`);
        }
      }
    } catch (err: any) {
      console.error('[Cron] Error during shift sweep:', err.message);
    }
  }, SWEEP_INTERVAL_MS);
}
