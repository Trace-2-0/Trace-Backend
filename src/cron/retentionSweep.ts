import { prisma } from '../lib/prisma';
import { PLAN_CONFIG } from '../config/plans';
import { deleteMultipleFromR2 } from '../services/r2.service';

// Run sweep every 24 hours (86,400,000 ms)
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * runRetentionSweep
 * ─────────────────────────────────────────────────────────
 * Iterates through all companies, determines their plan retention cutoff date,
 * purges expired screenshots from Cloudflare R2 bucket, and deletes rows from Postgres DB.
 */
export async function runRetentionSweep(): Promise<void> {
  console.log('[Retention Sweep] Starting automated data cleanup job...');

  try {
    // 1. Fetch all companies
    const companies = await prisma.company.findMany({
      select: { id: true, name: true, plan: true },
    });

    let totalPurgedCount = 0;

    for (const company of companies) {
      // Get plan config (fallback to free plan retention if unknown plan)
      const planKey = (company.plan in PLAN_CONFIG) ? (company.plan as keyof typeof PLAN_CONFIG) : 'free';
      const retentionDays = PLAN_CONFIG[planKey].retentionDays;

      // Calculate cutoff date: Screenshots older than cutoffDate will be deleted
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // 2. Find expired screenshots for this company
      const expiredScreenshots = await prisma.screenshot.findMany({
        where: {
          companyId: company.id,
          capturedAt: { lt: cutoffDate },
        },
        select: { id: true, storageKey: true, storageType: true },
      });

      if (expiredScreenshots.length === 0) continue;

      console.log(
        `[Retention Sweep] Company "${company.name}" (${company.plan}): Found ${expiredScreenshots.length} screenshots older than ${retentionDays} days.`
      );

      // 3. Separate Cloudflare R2 storage keys for bulk S3 delete
      const r2KeysToDelete = expiredScreenshots
        .filter((s) => s.storageType === 'r2' && s.storageKey)
        .map((s) => s.storageKey);

      if (r2KeysToDelete.length > 0) {
        await deleteMultipleFromR2(r2KeysToDelete);
      }

      // 4. Delete DB rows
      const deleteResult = await prisma.screenshot.deleteMany({
        where: {
          id: { in: expiredScreenshots.map((s) => s.id) },
        },
      });

      totalPurgedCount += deleteResult.count;
    }

    console.log(`[Retention Sweep] Completed. Total screenshots purged: ${totalPurgedCount}`);
  } catch (err: any) {
    console.error('[Retention Sweep] Error running retention cleanup:', err.message);
  }
}

/**
 * initRetentionSweepCron
 * ─────────────────────────────────────────────────────────
 * Initializes the background timer on server boot.
 * Runs once immediately, then schedules recurring 24-hour interval.
 */
export function initRetentionSweepCron(): void {
  console.log('[Cron] Retention sweep cron initialized (runs every 24h)');
  
  // Run first sweep 1 minute after server boot to avoid startup bottleneck
  setTimeout(() => {
    runRetentionSweep();
  }, 60 * 1000);

  // Recurring 24-hour interval
  setInterval(runRetentionSweep, SWEEP_INTERVAL_MS);
}
