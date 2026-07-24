import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseOrderStatus } from '../../common/enums/purchasing.enums';

export class PurchaseOrderItemDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 100, minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 45, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPurchasePrice!: number;
}

export class ExtraCostsDto {
  @ApiPropertyOptional({ example: 200, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingFee?: number;

  @ApiPropertyOptional({ example: 150, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customsFee?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherExpenses?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: '6a5ed964049dba03886e80f3' })
  @IsString()
  supplierId!: string;

  @ApiPropertyOptional({ example: '2026-07-20' })
  @IsOptional()
  @IsString()
  orderDate?: string;

  @ApiPropertyOptional({ enum: PurchaseOrderStatus, example: PurchaseOrderStatus.DRAFT })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];

  @ApiPropertyOptional({ type: ExtraCostsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtraCostsDto)
  extraCosts?: ExtraCostsDto;

  @ApiPropertyOptional({ example: 'Sea freight' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional({ example: '2026-07-20' })
  @IsOptional()
  @IsString()
  orderDate?: string;

  @ApiPropertyOptional({ type: [PurchaseOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items?: PurchaseOrderItemDto[];

  @ApiPropertyOptional({ type: ExtraCostsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtraCostsDto)
  extraCosts?: ExtraCostsDto;

  @ApiPropertyOptional({ example: 'Sea freight' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({ enum: PurchaseOrderStatus, example: PurchaseOrderStatus.RECEIVED })
  @IsEnum(PurchaseOrderStatus)
  status!: PurchaseOrderStatus;
}
