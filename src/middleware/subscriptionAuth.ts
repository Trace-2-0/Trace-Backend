import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { PLAN_CONFIG } from '../config/plans';

// 1. Guard for checking Employee Limits
export const checkEmployeeLimit = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) return res.status(401).json({ error: "Unauthorized" });


        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: {
                _count: {
                    select: { users: true } // employee numbers
                }
            }
        });

        if (!company) return res.status(404).json({ error: "Company not found" });

        
        const currentPlan = (company.plan as keyof typeof PLAN_CONFIG) || 'free';
        const limit = PLAN_CONFIG[currentPlan]?.maxEmp || 3;
        const currentCount = company._count.users;

        // Check if limit exceeded
        if (currentCount >= limit) {
             res.status(403).json({ 
                error: `Limit Reached. Your ${currentPlan} plan only allows ${limit} employees. Please upgrade.` 
            });
            return;
        }

        
        next();

    } catch (error) {
        console.error("Employee Limit Check Error:", error);
        res.status(500).json({ error: "Internal Server Error checking limits" });
    }
};

// 2. Guard for Premium Features 
export const requirePremiumFeature = (feature: 'canUseScreenshots') => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const companyId = req.user?.companyId;
            if (!companyId) return res.status(401).json({ error: "Unauthorized" });

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                select: { plan: true }
            });

            const currentPlan = (company?.plan as keyof typeof PLAN_CONFIG) || 'free';
            const hasAccess = PLAN_CONFIG[currentPlan]?.[feature];

            if (!hasAccess) {
                 res.status(403).json({ 
                    error: `Upgrade Required. This feature is not available in the ${currentPlan} plan.` 
                });
                return;
            }

            next();
        } catch (error) {
            res.status(500).json({ error: "Internal Server Error checking features" });
        }
    };
};
