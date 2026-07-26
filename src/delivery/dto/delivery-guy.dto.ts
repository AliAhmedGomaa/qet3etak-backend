import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import {
  DeliveryFeeModel,
  DeliveryGuyStatus,
} from '../../common/enums/delivery.enums';

export class CreateDeliveryGuyDto {
  @ApiProperty({ example: 'محمد أحمد' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: '01001234567' })
  @IsString()
  @MinLength(8)
  phone!: string;

  @ApiProperty({
    example: 'Delivery123!',
    description: 'Portal login password (required on create)',
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ example: 'Cairo' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Motorbike' })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({ example: 'Works evenings only' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: DeliveryGuyStatus,
    example: DeliveryGuyStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(DeliveryGuyStatus)
  status?: DeliveryGuyStatus;

  @ApiPropertyOptional({
    enum: DeliveryFeeModel,
    example: DeliveryFeeModel.FLAT,
  })
  @IsOptional()
  @IsEnum(DeliveryFeeModel)
  feeModel?: DeliveryFeeModel;

  @ApiPropertyOptional({ example: 35, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  flatFee?: number;

  @ApiPropertyOptional({ example: 2.5, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentRate?: number;

  @ApiPropertyOptional({ example: 20, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseFee?: number;

  @ApiPropertyOptional({ example: 3, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  perItemFee?: number;
}

export class UpdateDeliveryGuyDto extends PartialType(CreateDeliveryGuyDto) {
  @ApiPropertyOptional({
    example: 'Delivery123!',
    description: 'Optional new portal password',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

export class CalculateDeliveryFeeDto {
  @ApiProperty({ example: 1500, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderTotal!: number;

  @ApiProperty({ example: 5, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  itemCount!: number;
}

export class AssignDeliveryDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  deliveryGuyId!: string;

  @ApiPropertyOptional({
    example: 'Assigned for afternoon route',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
