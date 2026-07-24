import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserStatus } from '../../common/enums/user.enums';

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
}

export class UpdateAdminShopDto extends PartialType(CreateAdminShopDto) {
  @ApiPropertyOptional({ example: 'Shop123!', minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
