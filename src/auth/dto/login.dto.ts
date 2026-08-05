import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '0500000000' })
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/)
  phone!: string;

  @ApiProperty({ example: 'Admin123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;
}

/** Delivery portal login — requires GPS inside an admin workplace geofence. */
export class DeliveryLoginDto extends LoginDto {
  @ApiProperty({ example: 30.0444, description: 'Current latitude (WGS84)' })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 31.2357, description: 'Current longitude (WGS84)' })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

export class DeliveryLocationDto {
  @ApiProperty({ example: 30.0444 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 31.2357 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
