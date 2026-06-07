import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import fs from 'fs';

import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './routes/auth.routes';
import agentRoutes from './routes/agent.routes';
import companyRoutes from './routes/company.routes';
import teamRoutes from './routes/team.routes';
import userRoutes from './routes/user.routes';
import settingsRoutes from './routes/settings.routes';
import appTagRoutes from './routes/appTag.routes';
import sseRoutes from './routes/sse.routes';
import storageRoutes from './routes/storage.routes';
import { startShiftSweep } from './cron/shiftSweep';
import { prisma } from './lib/prisma';

// ─── Types ───────────────────────────────────────────────────
import './types';

const app = express();

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

const rawSchema = fs.readFileSync(path.join(__dirname, 'schemas', 'json-schema.json'), 'utf-8');
const fixedSchema = rawSchema.replace(/#\/definitions\//g, '#/components/schemas/');
const prismaModels = JSON.parse(fixedSchema).definitions;

// ─── Swagger ─────────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Trace 1.0 API',
      version: '1.0.0',
      description:
        'Backend API for Trace 1.0 — Desktop Agent communication, shift management, app tracking, and more.',
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Local dev server',
      },
    ],
    components: {
      schemas: prismaModels,
      securitySchemes: {
        AgentToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-agent-token',
          description: 'Electron desktop agent token (from User.agentToken)',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from /api/auth/*/login',
        },
      },
    },
  },
  apis: [
    path.join(__dirname, 'routes', '*.ts'),
    path.join(__dirname, 'routes', '*.js'),
  ],
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Trace 1.0 — API Docs',
}));

// Expose raw spec
app.get('/api/docs.json', (_req, res) => {
  res.json(swaggerSpec);
});

// ─── Health check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── Superadmin direct DB retrieve endpoint ──────────────────
app.get('/api/superadmin/companies', async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        users: true,
      },
    });
    res.json(companies);
  } catch (err) {
    next(err);
  }
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


// ─── 404 handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ────────────────────────────────────
app.use(errorHandler);

// Start the background cron job for stale shifts
startShiftSweep();

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
