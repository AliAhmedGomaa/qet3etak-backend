/**
 * Keep image uploads under Vercel’s ~4.5MB serverless body limit
 * (`FUNCTION_PAYLOAD_TOO_LARGE` / 413). Multipart overhead means the
 * file itself must stay below this.
 */
export const MAX_UPLOAD_FILE_BYTES = 3 * 1024 * 1024;
/** Reject early when Content-Length is clearly over the platform limit. */
export const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = /^image\/(jpeg|jpg|png|webp)$/i;

export const UPLOAD_TOO_LARGE_MESSAGE =
  'Image must be 3MB or smaller. Compress or resize the photo and try again.';
