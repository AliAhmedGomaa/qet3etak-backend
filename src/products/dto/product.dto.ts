import { Type, Transform, plainToInstance } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { QualityGrade } from '../../common/enums/product.enums';

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
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  minQty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(1)
  brand!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsString()
  @MinLength(1)
  category!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  part?: string;

  @IsEnum(QualityGrade)
  qualityGrade!: QualityGrade;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQuantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePrice!: number;

  @IsOptional()
  @Transform(({ value }) => parseTieredPricing(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TieredPriceDto)
  tieredPricing?: TieredPriceDto[];

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  part?: string;

  @IsOptional()
  @IsEnum(QualityGrade)
  qualityGrade?: QualityGrade;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @Transform(({ value }) => parseTieredPricing(value))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TieredPriceDto)
  tieredPricing?: TieredPriceDto[];

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}

export class CatalogQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  /** Comma-separated multi-select values */
  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  category?: string;

  /** Comma-separated part names (generic — accepts exact names or synonyms) */
  @IsOptional()
  @IsString()
  part?: string;

  @IsOptional()
  @IsString()
  qualityGrade?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 24;
}

export class CartLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CalculateCartDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];
}
