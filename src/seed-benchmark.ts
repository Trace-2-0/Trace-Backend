import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function main() {
  console.log('Seeding DB with realistic varied benchmark data...');

  const trialEndsAt = new Date();
  trialEndsAt.setFullYear(trialEndsAt.getFullYear() + 1);

  // 1. Create/Update Benchmark Company
  const passwordHash = await bcrypt.hash('pass12345', 10);
  const company = await prisma.company.upsert({
    where: { email: 'admin@benchmark.com' },
    update: {},
    create: {
      name: 'Benchmark Enterprise Corp',
      slug: 'benchmark-corp',
      email: 'admin@benchmark.com',
      passwordHash,
      plan: 'starter',
      maxEmployees: 200,
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

  // 5. Create 50 Employees + Shifts & Telemetry
  console.log('Populating 50 Users, Shifts, Breaks, and App Usage...');
  const appList = [
    { name: 'Visual Studio Code', baseSecs: 14400, tag: 'productive' },
    { name: 'Google Chrome', baseSecs: 7200, tag: 'neutral' },
    { name: 'Slack', baseSecs: 3600, tag: 'productive' },
    { name: 'Figma', baseSecs: 2700, tag: 'productive' },
    { name: 'YouTube', baseSecs: 1800, tag: 'unproductive' },
  ];

  for (let i = 1; i <= 50; i++) {
    const userEmail = `emp${i}@benchmark.com`;
    let user = await prisma.user.findFirst({
      where: { companyId: company.id, email: userEmail },
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
      });
    }

    // Create 10 historical shifts per employee
    for (let d = 0; d < 10; d++) {
      const shiftDate = new Date();
      shiftDate.setDate(shiftDate.getDate() - d);
      shiftDate.setHours(0, 0, 0, 0);

      const isLate = Math.random() < 0.3;
      const startHour = isLate ? 9 + Math.random() * 0.75 : 8.75 + Math.random() * 0.25;
      const startTime = new Date(shiftDate.getTime() + startHour * 3600 * 1000);
      const isToday = d === 0;
      const endTime = isToday && Math.random() < 0.4 ? null : new Date(startTime.getTime() + 8 * 3600 * 1000);

      const existingShift = await prisma.shift.findFirst({
        where: { companyId: company.id, userId: user.id, date: shiftDate },
      });

      if (!existingShift) {
        const shift = await prisma.shift.create({
          data: {
            companyId: company.id,
            userId: user.id,
            date: shiftDate,
            startTime,
            endTime,
            isLate,
          },
        });

        // Add 1-2 random Breaks per shift
        const breakCount = Math.floor(Math.random() * 2) + 1;
        for (let b = 0; b < breakCount; b++) {
          const breakStart = new Date(startTime.getTime() + (3 + b * 2) * 3600 * 1000);
          const breakDurationMins = Math.floor(Math.random() * 25) + 15;
          const breakEnd = new Date(breakStart.getTime() + breakDurationMins * 60 * 1000);
          const durationSecs = breakDurationMins * 60;

          await prisma.break.create({
            data: {
              companyId: company.id,
              shiftId: shift.id,
              startTime: breakStart,
              endTime: breakEnd,
              durationSecs,
            },
          });
        }

        // Add Daily App Usage telemetry matching schema fields: (activeSecs, tag)
        for (const app of appList) {
          const variation = Math.floor((Math.random() - 0.5) * 1200);
          const activeSecs = Math.max(300, app.baseSecs + variation);

          await prisma.dailyAppUsage.create({
            data: {
              companyId: company.id,
              userId: user.id,
              date: shiftDate,
              appName: app.name,
              activeSecs,
              tag: app.tag,
            },
          });
        }
      }
    }
  }

  console.log('Realistic DB benchmark seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
