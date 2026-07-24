import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

/** Body for DELETE push subscription endpoints. */
export class UnsubscribePushDto {
  @ApiPropertyOptional({
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
    description: 'Push endpoint to remove; omit to clear all for this user',
  })
  @IsOptional()
  @IsString()
  endpoint?: string;
}

/** Multipart file field helpers referenced in controller @ApiBody schemas. */
export class MultipartFileField {
  @ApiProperty({ type: 'string', format: 'binary' })
  file!: Express.Multer.File;
}
