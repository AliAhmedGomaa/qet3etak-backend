import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';
import { UPLOAD_TOO_LARGE_MESSAGE } from './upload-limits';

@Catch(MulterError, PayloadTooLargeException)
export class UploadExceptionFilter implements ExceptionFilter {
  catch(
    exception: MulterError | PayloadTooLargeException,
    host: ArgumentsHost,
  ): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof MulterError) {
      if (exception.code === 'LIMIT_FILE_SIZE') {
        res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          error: 'Payload Too Large',
          message: UPLOAD_TOO_LARGE_MESSAGE,
        });
        return;
      }
      res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message || 'Invalid upload',
      });
      return;
    }

    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      error: 'Payload Too Large',
      message: UPLOAD_TOO_LARGE_MESSAGE,
    });
  }
}
