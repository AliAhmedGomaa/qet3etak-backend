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
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OrderStatus, PaymentMethod } from '../../common/enums/order.enums';

export class CheckoutItemDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class WalkInItemDto extends CheckoutItemDto {
  /** Optional override of catalog unit price (EGP). */
  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CheckoutDto {
  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH_ON_DELIVERY })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ example: 'Deliver before noon' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Admin counter / walk-in sale at the physical shop. */
export class WalkInSaleDto {
  @ApiProperty({ type: [WalkInItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WalkInItemDto)
  items!: WalkInItemDto[];

  @ApiPropertyOptional({ example: 'أحمد' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ example: '01001234567' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'بيع نقدي من المحل' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Optional overrides when reordering a past order. */
export class ReorderDto {
  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: 'Defaults to the source order payment method',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Reorder of QT-20260721-00307' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.SHIPPED })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({ example: 'Picking items' })
  @IsOptional()
  @IsString()
  note?: string;

  /** Optional: assign / reassign a delivery guy when updating status (e.g. SHIPPED). */
  @ApiPropertyOptional({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsOptional()
  @IsString()
  deliveryGuyId?: string;
}

export class AssignOrderDeliveryDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  deliveryGuyId!: string;

  @ApiPropertyOptional({ example: 'Afternoon route' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class SetCreditLimitDto {
  @ApiProperty({ example: 75000, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditLimit!: number;

  @ApiPropertyOptional({ example: 'Trusted shop — raise limit' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class RecordPaymentDto {
  @ApiProperty({ example: 5000, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: 'Cash collection 21 Jul' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  note?: string;
}
