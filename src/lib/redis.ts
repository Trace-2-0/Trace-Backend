import Redis from 'ioredis';
import { logger } from '../config/logger';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('connect', () => {
  logger.info('[Redis] Connected to Upstash Redis Cloud successfully');
});

redis.on('error', (err) => {
  logger.error({ error: err.message }, '[Redis] Connection error');
});
