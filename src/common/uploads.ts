import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Local disk for uploaded images.
 *
 * Serverless runtimes (Vercel / Lambda) mount the app under `/var/task` as
 * read-only — only `/tmp` is writable — so we detect that and redirect there.
 *
 * Placeholder / seed images are tracked under `src/assets/uploads`, included in
 * the Vercel function bundle (vercel.json includeFiles + nest-cli assets), and
 * copied into the writable uploads dir on boot when possible.
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
 * Checked in order for Nest build output, Vercel function layout, and local dev.
 */
export function getBundledUploadsDir(): string | null {
  const candidates = [
    // Source tree (also shipped via vercel.json includeFiles)
    join(process.cwd(), 'src', 'assets', 'uploads'),
    // Nest CLI assets: dist/assets/uploads
    join(process.cwd(), 'dist', 'assets', 'uploads'),
    join(process.cwd(), 'dist', 'src', 'assets', 'uploads'),
    // Relative to this module (dist/src/common or similar)
    join(__dirname, '..', '..', 'assets', 'uploads'),
    join(__dirname, '..', 'assets', 'uploads'),
    join(__dirname, 'assets', 'uploads'),
    // Absolute under /var/task (Vercel)
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

  let names: string[] = [...BUNDLED_UPLOAD_FILES];
  try {
    names = [
      ...new Set([
        ...names,
        ...readdirSync(sourceDir).filter((n) =>
          /\.(png|jpe?g|webp|gif|svg)$/i.test(n),
        ),
      ]),
    ];
  } catch {
    // keep BUNDLED_UPLOAD_FILES only
  }

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

/**
 * Static roots for ServeStaticModule: writable uploads first, then bundled
 * placeholders (so seed images work even if /tmp seeding fails).
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
