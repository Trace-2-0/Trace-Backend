import {performance} from 'perf_hooks';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import {prisma} from '../lib/prisma';
import {addScreenshotJob} from '../queues/screenshotQueue';

async function runBenchmark() {
    const dummyBuffer = await sharp({
        create: {
            width: 1920,
            height: 1080,
            channels: 4,
            background: {
                r: 50,
                g: 100,
                b: 200,
                alpha: 1
            }
        }
    }).png().toBuffer();

    const base64Image = `data:image/png;base64,${
        dummyBuffer.toString('base64')
    }`;

    const testUser = await prisma.user.findFirst();
    const testShift = await prisma.shift.findFirst();

    if (! testUser || ! testShift) {
        console.error('Test user or shift missing in database');
        process.exit(1);
    }

    // 1. Synchronous Inline Thread Execution
    const t1 = performance.now();
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const rawBuffer = Buffer.from(cleanBase64, 'base64');
    const step1Ms = performance.now() - t1;

    const t2 = performance.now();
    const compressedBuffer = await sharp(rawBuffer).resize(1280, 720, {
        fit: 'inside',
        withoutEnlargement: true
    }).webp({quality: 80}).toBuffer();
    const step2Ms = performance.now() - t2;

    const t3 = performance.now();
    const tempFilePath = path.join(__dirname, '../../uploads/screenshots', `benchmark_${
        Date.now()
    }.webp`);
    await fs.mkdir(path.dirname(tempFilePath), {recursive: true});
    await fs.writeFile(tempFilePath, compressedBuffer);
    const step3Ms = performance.now() - t3;

    const t4 = performance.now();
    await prisma.screenshot.create({
        data: {
            companyId: testUser.companyId,
            userId: testUser.id,
            shiftId: testShift.id,
            storageKey: tempFilePath,
            storageType: 'local',
            fileSizeBytes: compressedBuffer.length,
            capturedAt: new Date(),
            status: 'ok'
        }
    });
    const step4Ms = performance.now() - t4;

    const totalSyncMs = step1Ms + step2Ms + step3Ms + step4Ms;

    // 2. Asynchronous BullMQ Queue Enqueue
    await addScreenshotJob({
        companyId: testUser.companyId,
        userId: testUser.id,
        shiftId: testShift.id,
        base64Image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        timestamp: new Date().toISOString()
    });

    const tQueue = performance.now();
    await addScreenshotJob({
        companyId: testUser.companyId,
        userId: testUser.id,
        shiftId: testShift.id,
        base64Image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        timestamp: new Date().toISOString()
    });
    const queueMs = performance.now() - tQueue;

    const rawKb = (rawBuffer.length / 1024).toFixed(2);
    const compressedKb = (compressedBuffer.length / 1024).toFixed(2);
    const ratio = (((rawBuffer.length - compressedBuffer.length) / rawBuffer.length) * 100).toFixed(2);

    console.log('\n--- BullMQ Background Queue Benchmark ---');
    console.log(`Input Image: 1920x1080 (${rawKb} KB)`);
    console.log(`Compressed Output: 1280x720 WebP (${compressedKb} KB, ${ratio}% reduction)`);
    console.log(`Saved To: ${tempFilePath}\n`);

    console.table([
        {
            Step: '1. Base64 Decode',
            Mode: 'Synchronous',
            TimeMs: step1Ms.toFixed(2)
        },
        {
            Step: '2. Sharp WebP Compress',
            Mode: 'Synchronous',
            TimeMs: step2Ms.toFixed(2)
        },
        {
            Step: '3. Disk File Write',
            Mode: 'Synchronous',
            TimeMs: step3Ms.toFixed(2)
        },
        {
            Step: '4. Prisma DB Insert',
            Mode: 'Synchronous',
            TimeMs: step4Ms.toFixed(2)
        }, {
            Step: 'Total Synchronous Thread',
            Mode: 'Inline Blocking',
            TimeMs: totalSyncMs.toFixed(2)
        }, {
            Step: 'BullMQ Queue Enqueue',
            Mode: 'Async Queue',
            TimeMs: queueMs.toFixed(2)
        },
    ]);

    process.exit(0);
}

runBenchmark().catch((err) => {
    console.error(err);
    process.exit(1);
});
