import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { setupSwagger } from './config/swagger';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './routes/auth.routes';
import agentRoutes from './routes/agent.routes';
import companyRoutes from './routes/company.routes';
import teamRoutes from './routes/team.routes';
import userRoutes from './routes/user.routes';
import subscriptionRoutes from './routes/subscription.routes';
import superadminRoutes from './routes/superadmin.routes';
import settingsRoutes from './routes/settings.routes';
import appTagRoutes from './routes/appTag.routes';
import sseRoutes from './routes/sse.routes';
import storageRoutes from './routes/storage.routes';
import { startShiftSweep } from './cron/shiftSweep';
import { initRetentionSweepCron } from './cron/retentionSweep';
import { screenshotWorker } from './workers/screenshotWorker'; // Background BullMQ Queue Worker

import { httpLogger } from './config/logger';

// ─── Types ───────────────────────────────────────────────────
import './types';

const app = express();

// ─── Structured HTTP Logging ─────────────────────────────────
app.use(httpLogger);

// ─── Security ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: env.NODE_ENV === 'production' ? [] : '*',
    credentials: true,
  })
);

// ─── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' })); // 10MB for screenshot base64
app.use(express.urlencoded({ extended: true }));

// ─── Rate limiting (auth routes only) ────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Swagger Documentation ───────────────────────────────────
setupSwagger(app);

// ─── Health check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── Mount routes ────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/app-tags', appTagRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/superadmin', superadminRoutes);

// ─── 404 handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ────────────────────────────────────
app.use(errorHandler);

// Start background cron jobs
startShiftSweep();
initRetentionSweepCron();

// ─── Start server ────────────────────────────────────────────
app.listen(env.PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════════╗`);
  console.log(`  ║  Trace 1.0 Backend — v1.0.0                  ║`);
  console.log(`  ║  Mode: ${env.NODE_ENV.padEnd(38)}║`);
  console.log(`  ║  Port: ${String(env.PORT).padEnd(38)}║`);
  console.log(`  ║  Docs: http://localhost:${env.PORT}/api/docs${' '.repeat(12)}║`);
  console.log(`  ╚══════════════════════════════════════════════╝\n`);
});

export default app;
