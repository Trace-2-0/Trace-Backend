import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resilient DB Operation Runner with 3 Network Retries
async function executeWithRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt >= retries) throw err;
      console.warn(`[Network Retry] TCP Connection dropped. Retrying attempt ${attempt}/${retries} in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
  throw new Error('Operation failed after max retries');
}

async function main() {
  console.log('Starting 1,000,000 DB records bulk insertion pipeline...');
  const startTimeMs = Date.now();

  const trialEndsAt = new Date();
  trialEndsAt.setFullYear(trialEndsAt.getFullYear() + 2);

  // 1. Create/Update Company
  const passwordHash = await bcrypt.hash('pass12345', 10);
  const company = await executeWithRetry(() =>
    prisma.company.upsert({
      where: { email: 'admin@benchmark.com' },
      update: { maxEmployees: 1000 },
      create: {
        name: 'Benchmark Enterprise Corp',
        slug: 'benchmark-corp',
        email: 'admin@benchmark.com',
        passwordHash,
        plan: 'starter',
        maxEmployees: 1000,
        trialEndsAt,
      },
    })
  );

  // 2. Settings & Teams
  await executeWithRetry(() =>
    prisma.companySettings.upsert({
      where: { companyId: company.id },
      update: {},
      create: {
        companyId: company.id,
        expectedWorkSecs: 28800,
        expectedActiveSecs: 25200,
        maxBreaksPerShift: 3,
        maxBreakDurationSecs: 3600,
        lateThresholdTime: '09:15',
        screenshotIntervalSecs: 60,
      },
    })
  );

  const teamNames = ['Frontend Core', 'Backend Infrastructure', 'DevOps & SRE', 'Mobile Engineering', 'Product Design'];
  const teams = [];
  for (let i = 0; i < 5; i++) {
    const existingTeam = await executeWithRetry(() =>
      prisma.team.findFirst({
        where: { companyId: company.id, name: teamNames[i] },
      })
    );
    if (existingTeam) {
      teams.push(existingTeam);
    } else {
      const newTeam = await executeWithRetry(() =>
        prisma.team.create({
          data: { companyId: company.id, name: teamNames[i] },
        })
      );
      teams.push(newTeam);
    }
  }

  // 3. User Accounts
  console.log('Step 1/3: Verifying 500 Employee Accounts...');
  const existingUsers = await executeWithRetry(() =>
    prisma.user.findMany({
      where: { companyId: company.id },
      select: { id: true, email: true },
    })
  );

  const existingEmailMap = new Set(existingUsers.map((u) => u.email));
  const newUsersToCreate: any[] = [];

  for (let i = 1; i <= 500; i++) {
    const userEmail = `emp${i}@benchmark.com`;
    if (!existingEmailMap.has(userEmail)) {
      newUsersToCreate.push({
        companyId: company.id,
        teamId: teams[i % 5].id,
        name: `Employee ${i} (${teamNames[i % 5]})`,
        email: userEmail,
        passwordHash,
        role: 'employee',
        agentToken: crypto.randomBytes(32).toString('hex'),
      });
    }
  }

  if (newUsersToCreate.length > 0) {
    console.log(`Inserting ${newUsersToCreate.length} missing employee accounts...`);
    await executeWithRetry(() =>
      prisma.user.createMany({
        data: newUsersToCreate,
        skipDuplicates: true,
      })
    );
  }

  const allUsers = await executeWithRetry(() =>
    prisma.user.findMany({
      where: { companyId: company.id },
      select: { id: true },
    })
  );
  const userIds = allUsers.map((u) => u.id);
  console.log(`Step 1/3 Complete: ${userIds.length} Employees Active in DB.`);

  // 4. Check existing counts to visualize resume progress
  const existingShiftCount = await executeWithRetry(() =>
    prisma.shift.count({ where: { companyId: company.id } })
  );
  console.log(`Pre-execution Audit: Found ${existingShiftCount.toLocaleString()} existing shifts in database.`);

  // 5. Streaming Batch Engine
  console.log('Step 2/3: Streaming Shifts & Breaks in 25 RAM-Safe Batches...');
  const appList = [
    { name: 'Visual Studio Code', baseSecs: 14400, tag: 'productive' },
    { name: 'Google Chrome', baseSecs: 7200, tag: 'neutral' },
    { name: 'Slack', baseSecs: 3600, tag: 'productive' },
    { name: 'Figma', baseSecs: 2700, tag: 'productive' },
    { name: 'YouTube', baseSecs: 1800, tag: 'unproductive' },
  ];

  let totalShiftsProcessed = 0;
  let totalBreaksProcessed = 0;
  let totalAppsProcessed = 0;

  const userBatchSize = 20;
  const totalUserBatches = Math.ceil(userIds.length / userBatchSize);

  for (let uIdx = 0; uIdx < userIds.length; uIdx += userBatchSize) {
    const batchNum = Math.floor(uIdx / userBatchSize) + 1;
    const sliceUserIds = userIds.slice(uIdx, uIdx + userBatchSize);
    const shiftChunk: any[] = [];
    const breakChunk: any[] = [];
    const appUsageChunk: any[] = [];

    for (const uId of sliceUserIds) {
      for (let d = 0; d < 1000; d++) {
        const shiftDate = new Date();
        shiftDate.setDate(shiftDate.getDate() - d);
        shiftDate.setHours(0, 0, 0, 0);

        const shiftId = `shf_${uId.slice(-6)}_${d}`;
        const isLate = d % 4 === 0;
        const startTime = new Date(shiftDate.getTime() + (isLate ? 9.25 : 8.75) * 3600 * 1000);
        const endTime = new Date(startTime.getTime() + 8 * 3600 * 1000);

        shiftChunk.push({
          id: shiftId,
          companyId: company.id,
          userId: uId,
          date: shiftDate,
          startTime,
          endTime,
          isLate,
        });

        const breakStart = new Date(startTime.getTime() + 4 * 3600 * 1000);
        const breakEnd = new Date(breakStart.getTime() + 30 * 60 * 1000);
        breakChunk.push({
          companyId: company.id,
          shiftId: shiftId,
          startTime: breakStart,
          endTime: breakEnd,
          durationSecs: 1800,
        });

        if (d % 5 === 0) {
          const app = appList[d % appList.length];
          appUsageChunk.push({
            companyId: company.id,
            userId: uId,
            date: shiftDate,
            appName: app.name,
            activeSecs: app.baseSecs,
            tag: app.tag,
          });
        }
      }
    }

    console.log(`Processing Batch ${batchNum}/${totalUserBatches} (${shiftChunk.length} Shifts, ${breakChunk.length} Breaks)...`);

    const innerChunkSize = 2000;
    for (let i = 0; i < shiftChunk.length; i += innerChunkSize) {
      await executeWithRetry(() =>
        prisma.shift.createMany({
          data: shiftChunk.slice(i, i + innerChunkSize),
          skipDuplicates: true,
        })
      );
      await sleep(30);
    }

    for (let i = 0; i < breakChunk.length; i += innerChunkSize) {
      await executeWithRetry(() =>
        prisma.break.createMany({
          data: breakChunk.slice(i, i + innerChunkSize),
          skipDuplicates: true,
        })
      );
      await sleep(30);
    }

    for (let i = 0; i < appUsageChunk.length; i += innerChunkSize) {
      await executeWithRetry(() =>
        prisma.dailyAppUsage.createMany({
          data: appUsageChunk.slice(i, i + innerChunkSize),
          skipDuplicates: true,
        })
      );
      await sleep(30);
    }

    totalShiftsProcessed += shiftChunk.length;
    totalBreaksProcessed += breakChunk.length;
    totalAppsProcessed += appUsageChunk.length;

    await sleep(100);
  }

  const finalShiftCount = await executeWithRetry(() =>
    prisma.shift.count({ where: { companyId: company.id } })
  );
  const newlyInsertedShifts = finalShiftCount - existingShiftCount;

  const elapsedSecs = ((Date.now() - startTimeMs) / 1000).toFixed(2);
  const grandTotal = totalShiftsProcessed + totalBreaksProcessed + totalAppsProcessed + userIds.length;

  console.log(`Pipeline Completed in ${elapsedSecs}s.`);
  console.log(`Total Shifts in Database: ${finalShiftCount.toLocaleString()}`);
  console.log(`Newly Inserted Shifts in This Run: ${newlyInsertedShifts.toLocaleString()}`);
  console.log(`Skipped (Already Existed): ${(totalShiftsProcessed - newlyInsertedShifts).toLocaleString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
