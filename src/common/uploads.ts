import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Local disk for uploaded images.
 *
 * Serverless runtimes (Vercel / Lambda) mount the app under `/var/task` as
 * read-only — only `/tmp` is writable — so we detect that and redirect there.
 *
 * Placeholder / seed images are tracked under `src/assets/uploads` and copied
 * into the writable uploads dir on boot (see seedBundledPlaceholders).
 * User uploads on serverless still do not persist across cold starts — use
 * object storage (S3, Blob, etc.) for durable user media.
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
export const BUNDLED_UPLOAD_FILES = [
  'admin-placeholder.png',
  'shop-placeholder.png',
  'product-placeholder.png',
  'product-screens.png',
  'product-batteries.png',
  'product-charging.png',
  'product-covers.png',
  'product-cameras.png',
  'product-flex.png',
  'product-generic.png',
] as const;

/**
 * Resolve the directory that contains bundled placeholder images.
 * Nest copies `src/assets/**` → `dist/assets/**` (see nest-cli.json).
 */
export function getBundledUploadsDir(): string | null {
  const candidates = [
    // Compiled: dist/src/common → dist/assets/uploads
    join(__dirname, '..', '..', 'assets', 'uploads'),
    // Compiled alternate: dist/common → dist/assets/uploads
    join(__dirname, '..', 'assets', 'uploads'),
    // Next to cwd after nest build
    join(process.cwd(), 'dist', 'assets', 'uploads'),
    join(process.cwd(), 'dist', 'src', 'assets', 'uploads'),
    // Dev / source tree
    join(process.cwd(), 'src', 'assets', 'uploads'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'shop-placeholder.png'))) {
      return dir;
    }
  }
  return null;
}

/**
 * Copy bundled placeholders into the writable uploads directory.
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
  if (!sourceDir) {
    console.warn(
      'Bundled placeholder uploads not found — /uploads placeholders may 404',
    );
    return dir;
  }

  const names = new Set<string>([
    ...BUNDLED_UPLOAD_FILES,
    ...readdirSync(sourceDir).filter((n) => /\.(png|jpe?g|webp|gif|svg)$/i.test(n)),
  ]);

  for (const name of names) {
    const src = join(sourceDir, name);
    const dest = join(dir, name);
    if (!existsSync(src) || existsSync(dest)) continue;
    try {
      copyFileSync(src, dest);
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
