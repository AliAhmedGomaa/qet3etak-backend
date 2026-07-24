import { diskStorage, type Options } from 'multer';
import { extname } from 'path';
import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_FILE_BYTES,
  UPLOAD_TOO_LARGE_MESSAGE,
} from './upload-limits';
import { ensureUploadsDir } from './uploads';

const ALLOWED_ICON_MIME = /^image\/(jpeg|jpg|png|webp|svg\+xml)$/i;

export function imageDiskStorage(filenamePrefix: string) {
  return diskStorage({
    destination: (_req, _file, cb) => cb(null, ensureUploadsDir()),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${filenamePrefix}-${unique}${ext}`);
    },
  });
}

export function imageFileFilter(
  allowSvg = false,
): NonNullable<Options['fileFilter']> {
  const pattern = allowSvg ? ALLOWED_ICON_MIME : ALLOWED_IMAGE_MIME;
  return (_req, file, cb) => {
    if (!pattern.test(file.mimetype)) {
      cb(
        new Error(
          allowSvg
            ? 'Only JPEG, PNG, WebP, or SVG images are allowed'
            : 'Only JPEG, PNG, or WebP images are allowed',
        ) as unknown as null,
        false,
      );
      return;
    }
    cb(null, true);
  };
}

/** Shared multer options for single-image fields. */
export function imageUploadOptions(
  filenamePrefix: string,
  options?: { allowSvg?: boolean },
): Options {
  return {
    storage: imageDiskStorage(filenamePrefix),
    limits: { fileSize: MAX_UPLOAD_FILE_BYTES },
    fileFilter: imageFileFilter(options?.allowSvg === true),
  };
}

export { MAX_UPLOAD_FILE_BYTES, UPLOAD_TOO_LARGE_MESSAGE };
