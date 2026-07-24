import type { NextFunction, Request, Response } from 'express';
import {
  MAX_REQUEST_BODY_BYTES,
  UPLOAD_TOO_LARGE_MESSAGE,
} from './upload-limits';

/**
 * Fail fast with JSON when Content-Length is already over the platform limit.
 * (Vercel otherwise returns a raw FUNCTION_PAYLOAD_TOO_LARGE 413.)
 */
export function rejectOversizedBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.headers['content-length'];
  if (!raw) {
    next();
    return;
  }
  const length = Number(raw);
  if (!Number.isFinite(length) || length <= MAX_REQUEST_BODY_BYTES) {
    next();
    return;
  }
  res.status(413).json({
    statusCode: 413,
    error: 'Payload Too Large',
    message: UPLOAD_TOO_LARGE_MESSAGE,
  });
}
