import { Queue } from 'bullmq';
import Redis from 'ioredis';

// 1. Connection Config: Environment variable REDIS_URL or fallback to Localhost
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

// 2. Define Screenshot Job Payload Interface
export interface ScreenshotJobPayload {
  companyId: string;
  userId: string;
  shiftId: string;
  base64Image: string; // Raw base64 payload from Electron Agent
  deviceOs?: string;
  timestamp: string;
}

// 3. Instantiate BullMQ Queue
export const screenshotQueue = new Queue<ScreenshotJobPayload>('screenshot-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Auto-retry up to 3 times if processing fails
    backoff: {
      type: 'exponential',
      delay: 2000, // Retry after 2s, 4s, 8s
    },
    removeOnComplete: 100, // Keep last 100 completed jobs in Redis logs
    removeOnFail: 500, // Keep last 500 failed jobs for debugging
  },
});

/**
 * Add a new screenshot processing job to the Redis BullMQ queue.
 * Takes < 5ms to execute.
 */
export async function addScreenshotJob(payload: ScreenshotJobPayload) {
  return await screenshotQueue.add('process-screenshot', payload);
}
