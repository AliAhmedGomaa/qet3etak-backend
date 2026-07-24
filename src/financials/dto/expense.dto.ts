import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExpenseCategory } from '../../common/enums/financial.enums';

export class CreateExpenseDto {
  @ApiProperty({ enum: ExpenseCategory, example: ExpenseCategory.RENT })
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @ApiProperty({ example: 8000, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 'Warehouse July rent' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class DamagedStockDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Cracked units from shipment' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PnlQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
