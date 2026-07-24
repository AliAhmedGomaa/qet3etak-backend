import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Local disk for uploaded images.
 *
 * Serverless runtimes (Vercel / Lambda) mount the app under `/var/task` as
 * read-only — only `/tmp` is writable — so we detect that and redirect there.
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

/** Create the uploads folder if needed. Never throws on import/boot. */
export function ensureUploadsDir(): string {
  const dir = getUploadsDir();
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    // Read-only FS or missing parent — multer destination will surface a clear error.
    console.warn(
      `Could not create uploads dir at ${dir}: ${(err as Error).message}`,
    );
  }
  return dir;
}
