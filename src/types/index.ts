// ────────────────────────────────────────────────────────────
// Extended Express types for Trace Backend
// ────────────────────────────────────────────────────────────

export interface AgentUser {
  userId: string;
  companyId: string;
  teamId: string | null;
  role: string;
  email: string;
  name: string;
}

export interface JwtUser {
  userId: string;
  companyId: string;
  role: string;
  type: 'company' | 'user';
}

// Extend Express Request type globally
declare global {
  namespace Express {
    interface Request {
      user?: JwtUser;
      agentUser?: AgentUser;
    }
  }
}

export {};
