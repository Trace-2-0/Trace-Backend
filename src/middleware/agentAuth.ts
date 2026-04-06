import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import '../types';

// ────────────────────────────────────────────────────────────
// Agent Token Authentication Middleware
// Desktop Electron agent sends: x-agent-token header
// Looks up User by agentToken, verifies active status
// ────────────────────────────────────────────────────────────

export async function agentAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers['x-agent-token'] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Missing x-agent-token header' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { agentToken: token },
      include: {
        company: { select: { id: true, isActive: true } },
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid agent token' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'User account is deactivated' });
      return;
    }

    if (!user.company.isActive) {
      res.status(403).json({ error: 'Company account is suspended' });
      return;
    }

    req.agentUser = {
      userId: user.id,
      companyId: user.companyId,
      teamId: user.teamId,
      role: user.role,
      email: user.email,
      name: user.name,
    };

    next();
  } catch (err) {
    next(err);
  }
}
