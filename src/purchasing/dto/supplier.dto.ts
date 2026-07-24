import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Shenzhen Parts Co' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: '+8613800138000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'CN' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  currentBalance?: number;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'Shenzhen Parts Co' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: '+8613800138000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'CN' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  currentBalance?: number;
}

export class SupplierPaymentDto {
  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @ApiPropertyOptional({ example: 'Wire transfer Jul batch' })
  @IsOptional()
  @IsString()
  note?: string;
}
