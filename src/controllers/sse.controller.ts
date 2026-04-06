import { Request, Response } from 'express';
import { sseManager } from '../lib/sse';

// ────────────────────────────────────────────────────────────
// GET /api/sse/stream
// Subscribe to real-time events for this company
// ────────────────────────────────────────────────────────────
export function streamEvents(req: Request, res: Response) {
  const { companyId } = req.user!;

  const clientId = sseManager.addClient(companyId, res);

  console.log(
    `[SSE] Stream opened for company ${companyId} — ${sseManager.getClientCount(companyId)} active clients`
  );

  // The connection stays open until the client disconnects.
  // Cleanup is handled by the SSEManager via the 'close' event.
}
