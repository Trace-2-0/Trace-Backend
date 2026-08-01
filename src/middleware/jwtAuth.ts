import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import '../types';

// ────────────────────────────────────────────────────────────
// JWT Authentication Middleware
// Dashboard/Admin users send: Authorization: Bearer <token>
// ────────────────────────────────────────────────────────────

interface JwtPayload {
  userId: string;
  companyId: string;
  role: string;
  type: 'company' | 'user';
}

export async function jwtAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Verify company is still active and trial is not expired
    const company = await prisma.company.findUnique({
      where: { id: decoded.companyId },
      select: { isActive: true, plan: true, trialEndsAt: true },
    });

    if (!company || !company.isActive) {
      res.status(403).json({ error: 'Company account is suspended' });
      return;
    }

    // Trial Expiration Guard
    if (company.plan === 'trial' && new Date() > company.trialEndsAt) {
      res.status(403).json({ 
        error: 'Company trial has expired. Please upgrade your plan to continue using Trace.',
        code: 'TRIAL_EXPIRED'
      });
      return;
    }

    req.user = {
      userId: decoded.userId,
      companyId: decoded.companyId,
      role: decoded.role,
      type: decoded.type,
    };

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (err.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    next(err);
  }
}

// ────────────────────────────────────────────────────────────
// Role-based access control middleware factory
// Usage: requireRole('admin') or requireRole('admin', 'manager')
// ────────────────────────────────────────────────────────────

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
      return;
    }

    next();
  };
}

// ────────────────────────────────────────────────────────────
// JWT Sign helper
// ────────────────────────────────────────────────────────────

export function signJwt(payload: JwtPayload, expiresInSecs: number = 7 * 24 * 60 * 60): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: expiresInSecs });
}
