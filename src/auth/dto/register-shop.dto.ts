import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterShopDto {
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

  @ApiPropertyOptional({ example: 30.0444, description: 'Shop latitude (WGS84)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLat?: number;

  @ApiPropertyOptional({ example: 31.2357, description: 'Shop longitude (WGS84)' })
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

  @ApiPropertyOptional({ description: 'Set internally when a file is uploaded' })
  @IsOptional()
  @IsString()
  commercialRegPhotoUrl?: string;
}
