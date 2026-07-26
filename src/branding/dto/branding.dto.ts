import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

const HEX = /^#([0-9a-fA-F]{6})$/;

export class UpdateBrandingDto {
  @ApiPropertyOptional({ example: 'قطع غيار' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  appName?: string;

  @ApiPropertyOptional({ example: 'منصة الجملة لقطع غيار الموبايل' })
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional({ example: '#10b880' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: 'accentColor must be #RRGGBB' })
  accentColor?: string;

  @ApiPropertyOptional({ example: '#0d9a6a' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: 'accentStrongColor must be #RRGGBB' })
  accentStrongColor?: string;

  @ApiPropertyOptional({ example: '#0f172a' })
  @IsOptional()
  @IsString()
  @Matches(HEX, { message: 'brandColor must be #RRGGBB' })
  brandColor?: string;

  @ApiPropertyOptional({ example: '/uploads/logo.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: '/uploads/favicon.png' })
  @IsOptional()
  @IsString()
  faviconUrl?: string;
}
