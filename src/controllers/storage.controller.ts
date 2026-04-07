import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getPresignedUrl, isR2Configured, PRESIGNED_URL_EXPIRY_SECS } from '../services/r2.service';

// ────────────────────────────────────────────────────────────
// GET /api/storage/screenshot/:screenshotId/url
// Returns a 1-hour pre-signed R2 URL for a screenshot.
// Dashboard should cache using the `expiresAt` field.
// ────────────────────────────────────────────────────────────
export async function getScreenshotUrl(req: Request, res: Response) {
  const { companyId } = req.user!;
  const screenshotId = req.params.screenshotId as string;

  const screenshot = await prisma.screenshot.findFirst({
    where: { id: screenshotId, companyId },
  });

  if (!screenshot) {
    res.status(404).json({ error: 'Screenshot not found' });
    return;
  }

  if (screenshot.storageType !== 'r2') {
    // Local fallback — return the local path key (not a URL)
    res.json({
      storageType: screenshot.storageType,
      storageKey: screenshot.storageKey,
      url: null,
      note: 'Screenshot is on local disk — serve via static file route or migrate to R2',
    });
    return;
  }

  if (!isR2Configured()) {
    res.status(503).json({ error: 'R2 storage not configured on this server' });
    return;
  }

  const url = await getPresignedUrl(screenshot.storageKey);
  const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRY_SECS * 1000).toISOString();

  res.json({
    url,
    expiresAt,       // Dashboard: cache until this time, then re-fetch
    storageType: 'r2',
    capturedAt: screenshot.capturedAt,
  });
}

// ────────────────────────────────────────────────────────────
// GET /api/storage/status
// Returns current storage config status (no credentials exposed).
// ────────────────────────────────────────────────────────────
export async function getStorageStatus(_req: Request, res: Response) {
  res.json({
    r2: {
      configured: isR2Configured(),
      bucket: process.env.R2_BUCKET_NAME || null,
      presignedUrlExpirySecs: PRESIGNED_URL_EXPIRY_SECS,
    },
    // Future: per-company drive status will be fetched from StorageConfig table
  });
}
