import { memoryStorage, type Options } from 'multer';
import { extname } from 'path';

/** Import files can be larger than product images (catalog dumps). */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = new Set(['.xlsx', '.json']);
const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',
  'text/json',
  'application/octet-stream', // browsers sometimes send this for .xlsx
]);

export function importFileFilter(): NonNullable<Options['fileFilter']> {
  return (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      cb(
        new Error('Only .xlsx or .json import files are allowed') as unknown as null,
        false,
      );
      return;
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype) && !file.mimetype.includes('json')) {
      // Allow octet-stream / empty for Excel; reject obvious mismatches
      if (ext === '.xlsx' && file.mimetype.startsWith('image/')) {
        cb(new Error('Invalid file type for import') as unknown as null, false);
        return;
      }
    }
    cb(null, true);
  };
}

/** In-memory multer options for admin bulk import uploads. */
export function importUploadOptions(): Options {
  return {
    storage: memoryStorage(),
    limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    fileFilter: importFileFilter(),
  };
}
