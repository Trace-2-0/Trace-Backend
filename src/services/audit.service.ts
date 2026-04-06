import { prisma } from '../lib/prisma';

// ────────────────────────────────────────────────────────────
// Audit Log Service
// Fire-and-forget — never blocks the response
// ────────────────────────────────────────────────────────────

interface AuditEntry {
  companyId: string;
  actorId?: string | null;
  actorType: 'admin' | 'employee' | 'system' | 'agent';
  action: string;
  targetId?: string | null;
  targetType?: string | null;
  meta?: Record<string, unknown> | null;
}

export function logAudit(entry: AuditEntry): void {
  // Fire-and-forget: don't await, don't block
  prisma.auditLog
    .create({
      data: {
        companyId: entry.companyId,
        actorId: entry.actorId || null,
        actorType: entry.actorType,
        action: entry.action,
        targetId: entry.targetId || null,
        targetType: entry.targetType || null,
        meta: (entry.meta as any) || undefined,
      },
    })
    .catch((err) => {
      console.error('[Audit] Failed to write audit log:', err.message);
    });
}
