import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function main() {
  console.log('Seeding DB with 100,000+ realistic benchmark records...');
  const startTimeMs = Date.now();

  const trialEndsAt = new Date();
  trialEndsAt.setFullYear(trialEndsAt.getFullYear() + 1);

  // 1. Create/Update Benchmark Company
  const passwordHash = await bcrypt.hash('pass12345', 10);
  const company = await prisma.company.upsert({
    where: { email: 'admin@benchmark.com' },
    update: { maxEmployees: 500 },
    create: {
      name: 'Benchmark Enterprise Corp',
      slug: 'benchmark-corp',
      email: 'admin@benchmark.com',
      passwordHash,
      plan: 'starter',
      maxEmployees: 500,
      trialEndsAt,
    },
  });

  // 2. Create/Update Company Settings
  await prisma.companySettings.upsert({
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
  });

  // 3. Create 5 Productivity App Tags
  const appTagData = [
    { appName: 'Visual Studio Code', tag: 'productive' },
    { appName: 'Google Chrome', tag: 'neutral' },
    { appName: 'Slack', tag: 'productive' },
    { appName: 'Figma', tag: 'productive' },
    { appName: 'YouTube', tag: 'unproductive' },
  ];

  for (const tagItem of appTagData) {
    const existingTag = await prisma.appTag.findFirst({
      where: { companyId: company.id, appName: tagItem.appName },
    });
    if (!existingTag) {
      await prisma.appTag.create({
        data: {
          companyId: company.id,
          appName: tagItem.appName,
          tag: tagItem.tag,
        },
      });
    }
  }

  // 4. Create 5 Engineering Teams
  const teams = [];
  const teamNames = ['Frontend Core', 'Backend Infrastructure', 'DevOps & SRE', 'Mobile Engineering', 'Product Design'];
  for (let i = 0; i < 5; i++) {
    const existingTeam = await prisma.team.findFirst({
      where: { companyId: company.id, name: teamNames[i] },
    });
    if (existingTeam) {
      teams.push(existingTeam);
    } else {
      const newTeam = await prisma.team.create({
        data: { companyId: company.id, name: teamNames[i] },
      });
      teams.push(newTeam);
    }
  }

  // 5. Populate 100 Employees
  console.log('Populating 100 Employees...');
  const userIds: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const userEmail = `emp${i}@benchmark.com`;
    let user = await prisma.user.findFirst({
      where: { companyId: company.id, email: userEmail },
      select: { id: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          companyId: company.id,
          teamId: teams[i % 5].id,
          name: `Employee ${i} (${teamNames[i % 5]})`,
          email: userEmail,
          passwordHash,
          role: 'employee',
          agentToken: crypto.randomBytes(32).toString('hex'),
        },
        select: { id: true },
      });
    }
    userIds.push(user.id);
  }

  // 6. Generate 36,500 Shift Records + Breaks + App Usage
  console.log('Generating 100,000+ Records in High-Performance Batches...');
  const appList = [
    { name: 'Visual Studio Code', baseSecs: 14400, tag: 'productive' },
    { name: 'Google Chrome', baseSecs: 7200, tag: 'neutral' },
    { name: 'Slack', baseSecs: 3600, tag: 'productive' },
    { name: 'Figma', baseSecs: 2700, tag: 'productive' },
    { name: 'YouTube', baseSecs: 1800, tag: 'unproductive' },
  ];

  const shiftBatch: any[] = [];
  const breakBatch: any[] = [];
  const dailyAppBatch: any[] = [];

  for (let u = 0; u < userIds.length; u++) {
    const uId = userIds[u];

    for (let d = 0; d < 365; d++) {
      const shiftDate = new Date();
      shiftDate.setDate(shiftDate.getDate() - d);
      shiftDate.setHours(0, 0, 0, 0);

      const shiftId = `shf_${uId.slice(-6)}_${d}`;
      const isLate = (u + d) % 4 === 0;
      const startHour = isLate ? 9.25 : 8.75;
      const startTime = new Date(shiftDate.getTime() + startHour * 3600 * 1000);
      const endTime = new Date(startTime.getTime() + 8 * 3600 * 1000);

      shiftBatch.push({
        id: shiftId,
        companyId: company.id,
        userId: uId,
        date: shiftDate,
        startTime,
        endTime,
        isLate,
      });

      // 1 Break per shift
      const breakStart = new Date(startTime.getTime() + 4 * 3600 * 1000);
      const breakEnd = new Date(breakStart.getTime() + 30 * 60 * 1000);
      breakBatch.push({
        companyId: company.id,
        shiftId: shiftId,
        startTime: breakStart,
        endTime: breakEnd,
        durationSecs: 1800,
      });

      // Daily app usage (1 record per day)
      if (d % 3 === 0) {
        const app = appList[d % appList.length];
        dailyAppBatch.push({
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

  console.log(`Inserting ${shiftBatch.length} Shifts, ${breakBatch.length} Breaks, ${dailyAppBatch.length} App Usages...`);

  // Batch insert in chunks of 5,000
  const chunkSize = 5000;
  for (let i = 0; i < shiftBatch.length; i += chunkSize) {
    await prisma.shift.createMany({
      data: shiftBatch.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }

  for (let i = 0; i < breakBatch.length; i += chunkSize) {
    await prisma.break.createMany({
      data: breakBatch.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }

  for (let i = 0; i < dailyAppBatch.length; i += chunkSize) {
    await prisma.dailyAppUsage.createMany({
      data: dailyAppBatch.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }

  const elapsedSecs = ((Date.now() - startTimeMs) / 1000).toFixed(2);
  const totalInserted = shiftBatch.length + breakBatch.length + dailyAppBatch.length + userIds.length;

  console.log(`SUCCESS! Inserted ${totalInserted.toLocaleString()} total DB records in ${elapsedSecs}s.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
