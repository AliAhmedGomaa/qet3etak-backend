import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { RepairTicketStatus } from '../../common/enums/repair.enums';

export class CreateRepairTicketDto {
  @ApiProperty({ example: 'أحمد محمد' })
  @IsString()
  @MinLength(2)
  customerName!: string;

  @ApiProperty({ example: '01012345678' })
  @IsString()
  @MinLength(8)
  customerPhone!: string;

  @ApiPropertyOptional({ example: '664f1a2b3c4d5e6f7a8b9c0d' })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ example: 'Apple' })
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiProperty({ example: 'iPhone 13' })
  @IsString()
  @MinLength(1)
  deviceModel!: string;

  @ApiPropertyOptional({ example: 'SCREEN' })
  @IsOptional()
  @IsString()
  issueCode?: string;

  @ApiProperty({ example: 'الشاشة مكسورة ولا تعمل باللمس' })
  @IsString()
  @MinLength(3)
  issueDescription!: string;

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  laborFee?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  warrantyDays?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  homePickup?: boolean;

  @ApiPropertyOptional({ example: 'القاهرة' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

export class AttachPartDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  laborFee?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  warrantyDays?: number;
}

export class UpdateRepairStatusDto {
  @ApiProperty({ enum: RepairTicketStatus })
  @IsEnum(RepairTicketStatus)
  status!: RepairTicketStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  warrantyDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  laborFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalCost?: number;
}

export class CreateRepairBookingDto {
  @ApiPropertyOptional({ example: '664f1a2b3c4d5e6f7a8b9c0d' })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ example: 'Samsung' })
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiProperty({ example: 'Galaxy S22' })
  @IsString()
  @MinLength(1)
  deviceModel!: string;

  @ApiProperty({ example: 'BATTERY' })
  @IsString()
  issueCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issueDescription?: string;

  @ApiPropertyOptional({ example: '664f1a2b3c4d5e6f7a8b9c0d' })
  @IsOptional()
  @IsString()
  preferredShopId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  homePickup?: boolean;

  @ApiProperty({ example: 'سارة علي' })
  @IsString()
  @MinLength(2)
  customerName!: string;

  @ApiProperty({ example: '01123456789' })
  @IsString()
  @MinLength(8)
  customerPhone!: string;

  @ApiPropertyOptional({ example: 'الجيزة' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}
