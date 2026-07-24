import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

export class CreateQualityDto {
  @ApiProperty({ example: 'OEM' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'oem', description: 'Unique slug; auto from name if omitted' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @ApiPropertyOptional({ example: 'Factory original equipment manufacturer parts' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}

export class UpdateQualityDto {
  @ApiPropertyOptional({ example: 'OEM' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'oem' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @ApiPropertyOptional({ example: 'Factory original equipment manufacturer parts' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}
