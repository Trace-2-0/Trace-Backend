import { Worker, Job } from 'bullmq';
import { redisConnection, ScreenshotJobPayload } from '../queues/screenshotQueue';
import { prisma } from '../lib/prisma';
import { logger } from '../config/logger';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Local storage directory for compressed screenshots if R2 is not configured
const uploadsDir = path.join(__dirname, '../../uploads/screenshots');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * BullMQ Worker: Consumes screenshot jobs asynchronously from Redis queue.
 * Performs base64 decoding, sharp WebP compression, disk/cloud storage, and DB insertion.
 */
export const screenshotWorker = new Worker<ScreenshotJobPayload>(
  'screenshot-processing',
  async (job: Job<ScreenshotJobPayload>) => {
    const { companyId, userId, shiftId, base64Image, timestamp } = job.data;
    const startTime = Date.now();

    logger.info({ jobId: job.id, userId }, 'Processing background screenshot job...');

    // 1. Decode Base64 Buffer
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const rawBuffer = Buffer.from(cleanBase64, 'base64');

    // 2. High-Performance WebP Compression using Sharp (Quality 80)
    const compressedBuffer = await sharp(rawBuffer)
      .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // 3. Save Compressed Image to Local Uploads Folder
    const filename = `${companyId}_${userId}_${Date.now()}.webp`;
    const filePath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(filePath, compressedBuffer);

    const relativeStorageUrl = `/uploads/screenshots/${filename}`;

    // 4. Save Database Record in PostgreSQL
    const screenshot = await prisma.screenshot.create({
      data: {
        companyId,
        userId,
        shiftId,
        storageKey: relativeStorageUrl,
        storageType: 'local',
        fileSizeBytes: compressedBuffer.length,
        capturedAt: new Date(timestamp || Date.now()),
        status: 'ok',
      },
    });

    const elapsedMs = Date.now() - startTime;
    logger.info(
      { jobId: job.id, screenshotId: screenshot.id, elapsedMs, rawSizeKb: Math.round(rawBuffer.length / 1024), compressedKb: Math.round(compressedBuffer.length / 1024) },
      'Background screenshot processing completed successfully'
    );

    return { screenshotId: screenshot.id, storageUrl: relativeStorageUrl, elapsedMs };
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 screenshot jobs concurrently per worker
  }
);

// Worker Error & Event Listeners
screenshotWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed successfully');
});

screenshotWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed in background queue');
});
