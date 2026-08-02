import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Get all companies across the SaaS platform (Superadmin feature)
 */
export const getAllCompanies = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            users: true,
            teams: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      count: companies.length,
      data: companies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Suspend or reactivate a company (Superadmin feature)
 */
export const toggleCompanySuspension = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { isActive, suspendedReason } = req.body;

    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const updatedCompany = await prisma.company.update({
      where: { id },
      data: {
        isActive: typeof isActive === 'boolean' ? isActive : !company.isActive,
        suspendedReason: suspendedReason ?? (isActive ? null : 'manual_suspension'),
      },
    });

    res.status(200).json({
      success: true,
      message: `Company ${updatedCompany.isActive ? 'activated' : 'suspended'} successfully`,
      data: updatedCompany,
    });
  } catch (error) {
    next(error);
  }
};
