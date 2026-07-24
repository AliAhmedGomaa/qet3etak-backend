import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EMBEDDED_PLACEHOLDER_PNGS } from './embedded-placeholders';

/**
 * Local disk for uploaded images.
 *
 * Serverless runtimes (Vercel / Lambda) mount the app under `/var/task` as
 * read-only — only `/tmp` is writable — so we detect that and redirect there.
 *
 * Placeholder images are:
 * 1. Tracked under `src/assets/uploads` (nest-cli assets / Docker)
 * 2. Embedded as base64 in `embedded-placeholders.ts` for Vercel (JS bundle)
 *
 * On boot we seed the writable uploads dir from filesystem assets when present,
 * otherwise from the embedded base64 map. User uploads on serverless still do
 * not persist across cold starts — use object storage for durable user media.
 */
function isServerlessRuntime(): boolean {
  return (
    !!process.env.VERCEL ||
    !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
    !!process.env.LAMBDA_TASK_ROOT ||
    process.cwd() === '/var/task'
  );
}

export function getUploadsDir(): string {
  if (isServerlessRuntime()) {
    return join('/tmp', 'uploads');
  }
  return join(process.cwd(), 'uploads');
}

/** Known seed / placeholder filenames shipped with the API. */
export const BUNDLED_UPLOAD_FILES = Object.keys(
  EMBEDDED_PLACEHOLDER_PNGS,
) as string[];

/**
 * Resolve the directory that contains bundled placeholder images on disk.
 */
export function getBundledUploadsDir(): string | null {
  const candidates = [
    join(process.cwd(), 'src', 'assets', 'uploads'),
    join(process.cwd(), 'dist', 'assets', 'uploads'),
    join(process.cwd(), 'dist', 'src', 'assets', 'uploads'),
    join(__dirname, '..', '..', 'assets', 'uploads'),
    join(__dirname, '..', 'assets', 'uploads'),
    join(__dirname, 'assets', 'uploads'),
    join('/var/task', 'src', 'assets', 'uploads'),
    join('/var/task', 'dist', 'assets', 'uploads'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'shop-placeholder.png'))) {
      return dir;
    }
  }
  return null;
}

/**
 * Copy / write bundled placeholders into the writable uploads directory.
 * Safe to call on every cold start; skips files that already exist.
 */
export function seedBundledPlaceholders(destDir?: string): string {
  const dir = destDir ?? getUploadsDir();
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn(
      `Could not create uploads dir at ${dir}: ${(err as Error).message}`,
    );
    return dir;
  }

  const sourceDir = getBundledUploadsDir();
  const names = new Set<string>([
    ...Object.keys(EMBEDDED_PLACEHOLDER_PNGS),
    ...(sourceDir
      ? readdirSync(sourceDir).filter((n) =>
          /\.(png|jpe?g|webp|gif|svg)$/i.test(n),
        )
      : []),
  ]);

  for (const name of names) {
    const dest = join(dir, name);
    if (existsSync(dest)) continue;

    try {
      if (sourceDir) {
        const src = join(sourceDir, name);
        if (existsSync(src)) {
          copyFileSync(src, dest);
          continue;
        }
      }
      const b64 = EMBEDDED_PLACEHOLDER_PNGS[name];
      if (b64) {
        writeFileSync(dest, Buffer.from(b64, 'base64'));
      }
    } catch (err) {
      console.warn(
        `Could not seed placeholder ${name}: ${(err as Error).message}`,
      );
    }
  }

  return dir;
}

/** Create the uploads folder and seed bundled placeholders. Never throws on import/boot. */
export function ensureUploadsDir(): string {
  return seedBundledPlaceholders(getUploadsDir());
}

/**
 * Static roots for ServeStaticModule: writable uploads first, then on-disk
 * bundled placeholders when available (local / Docker).
 */
export function getUploadsStaticRoots(): { rootPath: string; serveRoot: string }[] {
  const writable = ensureUploadsDir();
  const bundled = getBundledUploadsDir();
  const roots = [{ rootPath: writable, serveRoot: '/uploads' }];
  if (bundled && bundled !== writable) {
    roots.push({ rootPath: bundled, serveRoot: '/uploads' });
  }
  return roots;
}
