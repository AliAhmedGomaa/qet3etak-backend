import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const HEX = /^#([0-9a-fA-F]{6})$/;

export class UpdateShopCustomerAppDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'مركز النور للصيانة' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ example: 'إصلاح موبايل وضمان موثوق' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @ApiPropertyOptional({ example: 'al-nour' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens',
  })
  slug?: string;

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
}
