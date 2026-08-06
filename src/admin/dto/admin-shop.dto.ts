import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserStatus } from '../../common/enums/user.enums';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateAdminShopDto {
  @ApiProperty({ example: 'Ahmed Hassan' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: 'Hassan Mobile Parts' })
  @IsString()
  @MinLength(2)
  shopName!: string;

  @ApiProperty({ example: '01001234567' })
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone!: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString()
  @MinLength(2)
  city!: string;

  @ApiProperty({ example: '12 Tahrir St, Downtown' })
  @IsString()
  @MinLength(5)
  address!: string;

  @ApiPropertyOptional({ example: 30.0444 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLat?: number;

  @ApiPropertyOptional({ example: 31.2357 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLng?: number;

  @ApiProperty({ example: 'Shop123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({
    example: '/uploads/commercial-reg.jpg',
    description: 'Commercial registration / business card photo URL',
  })
  @IsOptional()
  @IsString()
  commercialRegPhotoUrl?: string;

  @ApiPropertyOptional({
    enum: UserStatus,
    example: UserStatus.APPROVED,
    description: 'Defaults to APPROVED for admin-created shops',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Required when status is REJECTED',
    example: 'Incomplete documents',
  })
  @ValidateIf((o: CreateAdminShopDto) => o.status === UserStatus.REJECTED)
  @IsString()
  @MinLength(3)
  rejectionReason?: string;

  @ApiPropertyOptional({
    example: '664f1a2b3c4d5e6f7a8b9c0d',
    description: 'Optional branch assignment (null/omit = HQ / unassigned)',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Shop-specific catalog discount percent (0–100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  shopDiscountPercent?: number;
}

export class UpdateAdminShopDto extends PartialType(CreateAdminShopDto) {
  @ApiPropertyOptional({ example: 'Shop123!', minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
