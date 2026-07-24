import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform, plainToInstance } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

function parseTieredPricing(value: unknown): TieredPriceDto[] | undefined {
  if (value == null || value === '') return undefined;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  return plainToInstance(
    TieredPriceDto,
    parsed.map((t: { minQty?: unknown; price?: unknown }) => ({
      minQty: Number(t?.minQty),
      price: Number(t?.price),
    })),
  );
}

export class TieredPriceDto {
  @ApiProperty({ example: 5, minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  minQty!: number;

  @ApiProperty({ example: 78, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Samsung S23 Battery' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty({ example: 'Samsung' })
  @IsString()
  @MinLength(1)
  brand!: string;

  @ApiProperty({ example: 'Galaxy S23' })
  @IsString()
  @MinLength(1)
  model!: string;

  @ApiProperty({ example: 'Batteries' })
  @IsString()
  @MinLength(1)
  category!: string;

  @ApiPropertyOptional({ example: 'Battery Pack' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  part?: string;

  @ApiPropertyOptional({
    example: '6a5e04e311d9cd2142b060e1',
    description: 'Preferred: Quality document id (must be active)',
  })
  @IsOptional()
  @IsMongoId()
  qualityId?: string;

  @ApiPropertyOptional({
    example: 'Original',
    description:
      'Denormalized quality name. Used when qualityId is omitted; resolved against Qualities.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  qualityGrade?: string;

  @ApiProperty({ example: 100, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQuantity!: number;

  @ApiProperty({ example: 28, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({
    type: [TieredPriceDto],
    description:
      'Quantity price breaks. In multipart requests, send as a JSON string.',
  })
  @IsOptional()
  @Transform(({ value }) => parseTieredPricing(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TieredPriceDto)
  tieredPricing?: TieredPriceDto[];

  @ApiPropertyOptional({ example: 'BAT-S23-ORG' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Samsung S23 Battery' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional({ example: 'Samsung' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'Galaxy S23' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'Batteries' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Battery Pack' })
  @IsOptional()
  @IsString()
  part?: string;

  @ApiPropertyOptional({
    example: '6a5e04e311d9cd2142b060e1',
    description: 'Preferred: Quality document id (must be active)',
  })
  @IsOptional()
  @IsMongoId()
  qualityId?: string;

  @ApiPropertyOptional({
    example: 'Original',
    description: 'Denormalized quality name when qualityId is omitted',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  qualityGrade?: string;

  @ApiPropertyOptional({ example: 100, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ example: 28, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({
    type: [TieredPriceDto],
    description:
      'Quantity price breaks. In multipart requests, send as a JSON string.',
  })
  @IsOptional()
  @Transform(({ value }) => parseTieredPricing(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TieredPriceDto)
  tieredPricing?: TieredPriceDto[];

  @ApiPropertyOptional({ example: 'BAT-S23-ORG' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}

export class CatalogQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Comma-separated multi-select values' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated part names (generic — accepts exact names or synonyms)',
  })
  @IsOptional()
  @IsString()
  part?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated quality grade names (denormalized)',
  })
  @IsOptional()
  @IsString()
  qualityGrade?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 24, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 24;
}

export class CartLineDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 5, minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CalculateCartDto {
  @ApiProperty({ type: [CartLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];
}
