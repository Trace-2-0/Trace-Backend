import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare R2 Storage Service
//
// Architecture (product-level, global):
//   Every company's screenshots land in ONE product-owner R2 bucket.
//   Path: screenshots/{companyId}/{userId}/{YYYY-MM-DD}/{HHmmss}.webp
//
// Credentials come from env vars (product owner controls this, not per-company).
// Web dashboard fetches via pre-signed URLs (cached until expiry).
//
// ─── Future: Per-Company Private Drive (NOT IMPLEMENTED — design only) ────────
//   Each company admin can connect their own OneDrive or Google Drive via OAuth.
//   When connected, screenshots route to their drive instead of R2.
//   Product owner has ZERO access to company-connected drives.
//   Flow:
//     1. Admin → "Connect Drive" in dashboard → OAuth2 redirect
//     2. Callback → exchange code → store encrypted tokens in StorageConfig
//     3. On each screenshot: check StorageConfig.storageType
//        - 'onedrive': PUT /drives/{id}/root:/{path}:/content (Graph API)
//        - 'googledrive': files.create multipart (Drive API)
//     4. storageKey = Drive file ID; storageType = 'onedrive'|'googledrive'
//     5. Presigned URL not applicable — admin generates share link from their drive
// ─────────────────────────────────────────────────────────────────────────────

const R2_ENDPOINT   = process.env.R2_ENDPOINT   || '';  
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY  || '';
const R2_SECRET_KEY = process.env.R2_SECRET_KEY  || '';
const R2_BUCKET     = process.env.R2_BUCKET_NAME || '';
const R2_REGION     = 'auto'; // R2 always uses 'auto'

// Presigned URL validity — 1 hour; dashboard caches until this expires
const PRESIGNED_URL_EXPIRY_SECS = 3600;


const WEBP_QUALITY = 60;

function isR2Configured(): boolean {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET);
}

function createR2Client(): S3Client {
  return new S3Client({
    region: R2_REGION,
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
  });
}

// webp conversion
export async function compressToWebP(inputBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(inputBuffer)
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();
  } catch (err: any) {
    console.warn('sharp compression failed, using original buffer:', err.message);
    return inputBuffer;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildStorageKey
// R2 key: screenshots/{companyId}/{userId}/{YYYY-MM-DD}/{HHmmss}.webp
// Deterministic — same capture produces same key (idempotent upload).
// ─────────────────────────────────────────────────────────────────────────────
export function buildStorageKey(companyId: string, userId: string, capturedAt: Date): string {
  const date = capturedAt.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = capturedAt.toISOString()
    .split('T')[1]
    .replace(/[:.]/g, '')
    .substring(0, 6); // HHmmss
  return `screenshots/${companyId}/${userId}/${date}/${time}.webp`;
}

// ─────────────────────────────────────────────────────────────────────────────
// uploadToR2
// Compresses to WebP, then PUTs to R2.
// Returns the storage key on success.
// Throws if R2 is not configured or upload fails.
// ─────────────────────────────────────────────────────────────────────────────
export async function uploadToR2(
  companyId: string,
  userId: string,
  capturedAt: Date,
  imageBuffer: Buffer
): Promise<{ storageKey: string; fileSizeBytes: number }> {
  if (!isR2Configured()) {
    throw new Error('R2 not configured — add R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET_NAME to .env');
  }

  const webpBuffer = await compressToWebP(imageBuffer);
  const storageKey = buildStorageKey(companyId, userId, capturedAt);

  const client = createR2Client();
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    Body: webpBuffer,
    ContentType: 'image/webp',
    Metadata: {
      companyId,
      userId,
      capturedAt: capturedAt.toISOString(),
    },
  }));

  console.log(`[R2] Uploaded ${storageKey} (${webpBuffer.length} bytes)`);
  return { storageKey, fileSizeBytes: webpBuffer.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// getPresignedUrl
// Generates a pre-signed GET URL valid for 1 hour.
// Dashboard should cache the URL and re-fetch only when expired.
// ─────────────────────────────────────────────────────────────────────────────
export async function getPresignedUrl(storageKey: string): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('R2 not configured');
  }

  const client = createR2Client();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
  });

  return getSignedUrl(client, command, { expiresIn: PRESIGNED_URL_EXPIRY_SECS });
}

export { isR2Configured, PRESIGNED_URL_EXPIRY_SECS };
