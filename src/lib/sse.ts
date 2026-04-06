import { Response } from 'express';

// ────────────────────────────────────────────────────────────
// SSE Connection Manager
// Manages per-company Server-Sent Event connections
// ────────────────────────────────────────────────────────────

interface SSEClient {
  id: string;
  res: Response;
  companyId: string;
}

class SSEManager {
  private clients: Map<string, SSEClient[]> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Send keepalive every 30 seconds to prevent connection drops
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((clients) => {
        clients.forEach((client) => {
          try {
            client.res.write(':keepalive\n\n');
          } catch {
            this.removeClient(client.id);
          }
        });
      });
    }, 30_000);
  }

  addClient(companyId: string, res: Response): string {
    const clientId = `${companyId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    const client: SSEClient = { id: clientId, res, companyId };

    const existing = this.clients.get(companyId) || [];
    existing.push(client);
    this.clients.set(companyId, existing);

    // Clean up on disconnect
    res.on('close', () => {
      this.removeClient(clientId);
    });

    console.log(`[SSE] Client connected: ${clientId} (company: ${companyId})`);
    return clientId;
  }

  removeClient(clientId: string): void {
    this.clients.forEach((clients, companyId) => {
      const filtered = clients.filter((c) => c.id !== clientId);
      if (filtered.length === 0) {
        this.clients.delete(companyId);
      } else {
        this.clients.set(companyId, filtered);
      }
    });
  }

  broadcast(companyId: string, event: string, data: unknown): void {
    const clients = this.clients.get(companyId);
    if (!clients || clients.length === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    const deadClients: string[] = [];
    clients.forEach((client) => {
      try {
        client.res.write(payload);
      } catch {
        deadClients.push(client.id);
      }
    });

    // Clean up dead connections
    deadClients.forEach((id) => this.removeClient(id));
  }

  getClientCount(companyId?: string): number {
    if (companyId) {
      return this.clients.get(companyId)?.length || 0;
    }
    let total = 0;
    this.clients.forEach((clients) => (total += clients.length));
    return total;
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clients.forEach((clients) => {
      clients.forEach((client) => {
        try {
          client.res.end();
        } catch { /* ignore */ }
      });
    });
    this.clients.clear();
  }
}

// Singleton
export const sseManager = new SSEManager();
