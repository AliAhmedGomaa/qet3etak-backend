import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BranchStatus } from '../../common/enums/branch.enums';

export class CreateBranchDto {
  @ApiProperty({ example: 'Cairo Downtown' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'CAI-DT' })
  @IsString()
  @MinLength(2)
  code!: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString()
  @MinLength(2)
  city!: string;

  @ApiProperty({ example: '12 Tahrir St' })
  @IsString()
  @MinLength(3)
  address!: string;

  @ApiPropertyOptional({ example: '01001234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Near metro station' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: BranchStatus, example: BranchStatus.ACTIVE })
  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;

  @ApiPropertyOptional({
    example: 30.0444,
    description: 'Workplace geofence latitude (WGS84)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  geofenceLat?: number;

  @ApiPropertyOptional({
    example: 31.2357,
    description: 'Workplace geofence longitude (WGS84)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  geofenceLng?: number;

  @ApiPropertyOptional({
    example: 150,
    description: 'Geofence radius in meters (min 10)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(50000)
  geofenceRadiusMeters?: number;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class AssignBranchManagerDto {
  @ApiPropertyOptional({
    description:
      'Staff user id to assign as branch manager. Omit or null to clear.',
    example: '664f1a2b3c4d5e6f7a8b9c0d',
    nullable: true,
  })
  @IsOptional()
  @IsMongoId()
  userId?: string | null;
}
