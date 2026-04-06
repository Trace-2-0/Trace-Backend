import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { signJwt } from '../middleware/jwtAuth';
import { logAudit } from '../services/audit.service';

// ────────────────────────────────────────────────────────────
// Helper: Generate Company Slug
// ────────────────────────────────────────────────────────────
async function generateCompanySlug(name: string): Promise<string> {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  let slug = baseSlug;
  let counter = 2;

  while (await prisma.company.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

// ────────────────────────────────────────────────────────────
// POST /api/auth/company/register
// ────────────────────────────────────────────────────────────
export async function registerCompany(req: Request, res: Response) {
  const { name, email, password, adminName } = req.body;

  const slug = await generateCompanySlug(name);

  const passwordHash = await bcrypt.hash(password, 12);
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create company
    const company = await tx.company.create({
      data: {
        name,
        slug,
        email,
        passwordHash,
        trialEndsAt,
      },
    });

    // 2. Create default settings
    await tx.companySettings.create({
      data: { companyId: company.id },
    });

    // 3. Create admin user
    const adminPasswordHash = await bcrypt.hash(password, 12);
    const agentToken = crypto.randomBytes(32).toString('hex');

    const adminUser = await tx.user.create({
      data: {
        companyId: company.id,
        email,
        name: adminName,
        passwordHash: adminPasswordHash,
        role: 'admin',
        agentToken,
      },
    });

    return { company, adminUser };
  });

  // Generate JWT
  const token = signJwt({
    userId: result.adminUser.id,
    companyId: result.company.id,
    role: 'admin',
    type: 'company',
  });

  logAudit({
    companyId: result.company.id,
    actorId: result.adminUser.id,
    actorType: 'admin',
    action: 'company.registered',
    targetId: result.company.id,
    targetType: 'company',
  });

  res.status(201).json({
    token,
    company: {
      id: result.company.id,
      slug: result.company.slug,
      name: result.company.name,
      email: result.company.email,
      plan: result.company.plan,
      trialEndsAt: result.company.trialEndsAt,
    },
    user: {
      id: result.adminUser.id,
      name: result.adminUser.name,
      email: result.adminUser.email,
      role: result.adminUser.role,
      agentToken: result.adminUser.agentToken,
    },
  });
}

// ────────────────────────────────────────────────────────────
// POST /api/auth/company/login
// ────────────────────────────────────────────────────────────
export async function loginCompany(req: Request, res: Response) {
  const { email, password } = req.body;

  const company = await prisma.company.findUnique({
    where: { email },
  });

  if (!company) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, company.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!company.isActive) {
    res.status(403).json({ error: 'Company account is suspended', reason: company.suspendedReason });
    return;
  }

  // Find the admin user for this company
  const adminUser = await prisma.user.findFirst({
    where: { companyId: company.id, role: 'admin', isActive: true },
  });

  const token = signJwt({
    userId: adminUser?.id || company.id,
    companyId: company.id,
    role: 'admin',
    type: 'company',
  });

  logAudit({
    companyId: company.id,
    actorId: adminUser?.id,
    actorType: 'admin',
    action: 'company.login',
    targetId: company.id,
    targetType: 'company',
  });

  res.json({
    token,
    company: {
      id: company.id,
      slug: company.slug,
      name: company.name,
      plan: company.plan,
    },
  });
}

// ────────────────────────────────────────────────────────────
// POST /api/auth/user/login
// ────────────────────────────────────────────────────────────
export async function loginUser(req: Request, res: Response) {
  const { companySlug, companyId, email, password } = req.body;

  const company = companyId
    ? await prisma.company.findUnique({ where: { id: companyId } })
    : await prisma.company.findUnique({ where: { slug: companySlug } });

  if (!company) {
    res.status(401).json({ error: 'Invalid company or credentials' });
    return;
  }

  if (!company.isActive) {
    res.status(403).json({ error: 'Company account is suspended' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { companyId_email: { companyId: company.id, email } },
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Invalid company or credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid company or credentials' });
    return;
  }

  const token = signJwt({
    userId: user.id,
    companyId: company.id,
    role: user.role,
    type: 'user',
  });

  logAudit({
    companyId: company.id,
    actorId: user.id,
    actorType: user.role as any,
    action: 'user.login',
    targetId: user.id,
    targetType: 'user',
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agentToken: user.agentToken,
    },
    company: {
      id: company.id,
      slug: company.slug,
      name: company.name,
    },
  });
}
