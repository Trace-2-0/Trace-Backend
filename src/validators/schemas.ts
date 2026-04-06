import { z } from 'zod';

// ════════════════════════════════════════════════════════════
// AUTH SCHEMAS
// ════════════════════════════════════════════════════════════

export const companyRegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  adminName: z.string().min(2).max(100),
});

export const companyLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const userLoginSchema = z.object({
  companySlug: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(1),
}).refine(data => data.companySlug || data.companyId, {
  message: "Either companySlug or companyId must be provided"
});

// ════════════════════════════════════════════════════════════
// TEAM SCHEMAS
// ════════════════════════════════════════════════════════════

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  idleThresholdSecs: z.number().int().min(10).max(3600).optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  idleThresholdSecs: z.number().int().min(10).max(3600).optional(),
});

// ════════════════════════════════════════════════════════════
// USER SCHEMAS
// ════════════════════════════════════════════════════════════

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'manager', 'employee']).default('employee'),
  teamId: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['admin', 'manager', 'employee']).optional(),
  teamId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ════════════════════════════════════════════════════════════
// SETTINGS SCHEMAS
// ════════════════════════════════════════════════════════════

export const updateSettingsSchema = z.object({
  expectedWorkSecs: z.number().int().min(3600).max(86400).optional(),
  expectedActiveSecs: z.number().int().min(1800).max(86400).optional(),
  maxBreaksPerShift: z.number().int().min(0).max(20).optional(),
  maxBreakDurationSecs: z.number().int().min(60).max(7200).optional(),
  lateThresholdTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  screenshotIntervalSecs: z.number().int().min(60).max(3600).optional(),
  heartbeatGraceSecs: z.number().int().min(300).max(14400).optional(),
  blurScreenshotsOnBreak: z.boolean().optional(),
});

// ════════════════════════════════════════════════════════════
// APP TAG SCHEMAS
// ════════════════════════════════════════════════════════════

export const upsertAppTagSchema = z.object({
  appName: z.string().min(1).max(200),
  tag: z.enum(['productive', 'unproductive', 'neutral']),
});

// ════════════════════════════════════════════════════════════
// AGENT SCHEMAS (Desktop → Backend)
// ════════════════════════════════════════════════════════════

export const clockInSchema = z.object({
  deviceOs: z.string().max(50).optional(),
});

export const clockOutSchema = z.object({
  checkoutType: z.enum(['manual', 'shutdown', 'powercut']).default('manual'),
  checkoutReason: z.string().max(500).optional(),
});

export const heartbeatSchema = z.object({
  timestamp: z.string().datetime().optional(),
});

export const breakStartSchema = z.object({});

export const breakEndSchema = z.object({});

export const reportIdleSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  durationSecs: z.number().int().min(0),
});

export const uploadScreenshotSchema = z.object({
  imageBase64: z.string().min(100),
  capturedAt: z.string().datetime().optional(),
});

export const syncAppUsageSchema = z.object({
  active: z.object({
    name: z.string(),
    title: z.string().optional(),
    path: z.string().optional(),
    owner: z.string().optional(),
    pid: z.number().optional(),
    timestamp: z.number().optional(),
  }).nullable().optional(),
  usage: z.array(z.object({
    name: z.string().min(1),
    title: z.string().optional(),
    path: z.string().optional(),
    seconds: z.number().int().min(0),
  })).min(1),
});

export const disconnectSchema = z.object({
  reason: z.string().max(200).default('desktop_exit'),
  disconnectedAt: z.string().datetime().optional(),
});

// ════════════════════════════════════════════════════════════
// COMPANY UPDATE SCHEMA
// ════════════════════════════════════════════════════════════

export const updateCompanySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  maxEmployees: z.number().int().min(1).max(10000).optional(),
});

// ════════════════════════════════════════════════════════════
// COMMON PARAMS
// ════════════════════════════════════════════════════════════

export const idParamSchema = z.object({
  id: z.string().min(1),
});
