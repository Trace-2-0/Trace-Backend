import { Router, Request, Response } from 'express';
import { jwtAuth, requireRole } from '../middleware/jwtAuth';
import { prisma } from '../lib/prisma';
import { logger } from '../config/logger';

const router = Router();
router.use(jwtAuth);

/**
 * @openapi
 * /api/usage/historical:
 *   get:
 *     tags: [Usage]
 *     summary: Get historical daily app usage
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *         required: true
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Historical usage data
 */
router.get('/historical', requireRole('admin'), async (req: Request, res: Response) => {
  const { companyId } = req.user!;
  const fromStr = req.query.from as string;
  const toStr = req.query.to as string;

  if (!fromStr || !toStr) {
    res.status(400).json({ error: 'Missing from or to dates' });
    return;
  }

  try {
    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);
    
    // Add 1 day to 'toDate' to make it inclusive if it's just a YYYY-MM-DD string
    const toDateEnd = new Date(toDate);
    toDateEnd.setDate(toDateEnd.getDate() + 1);

    const usages = await prisma.dailyAppUsage.findMany({
      where: {
        companyId,
        date: {
          gte: fromDate,
          lt: toDateEnd,
        },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    interface UserData {
      user: { id: string; name: string };
      appsMap: Map<string, number>;
    }
    const userMap = new Map<string, UserData>();

    usages.forEach((u) => {
      if (!userMap.has(u.userId)) {
        userMap.set(u.userId, {
          user: { id: u.user.id, name: u.user.name },
          appsMap: new Map<string, number>(),
        });
      }
      const userData = userMap.get(u.userId)!;
      const currentSecs = userData.appsMap.get(u.appName) || 0;
      userData.appsMap.set(u.appName, currentSecs + u.activeSecs);
    });

    const users = Array.from(userMap.values()).map((u) => {
      const apps = Array.from(u.appsMap.entries()).map(([appName, seconds]) => ({
        appName,
        seconds,
      }));
      // Sort apps by usage descending
      apps.sort((a, b) => b.seconds - a.seconds);
      return { user: u.user, apps };
    });

    res.json({ users });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch historical usage');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Also add a quick endpoint for review-tags (used in frontend)
router.get('/review-tags', requireRole('admin'), async (req: Request, res: Response) => {
  const { companyId } = req.user!;
  try {
    const tags = await prisma.appTag.findMany({ where: { companyId } });
    const tagsMap: Record<string, string> = {};
    tags.forEach(t => { tagsMap[t.appName.toLowerCase()] = t.tag; });
    res.json({ tags: tagsMap });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
