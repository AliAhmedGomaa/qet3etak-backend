import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BranchStatus } from '../../common/enums/branch.enums';

export class GeofencePointDto {
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
    type: [GeofencePointDto],
    description:
      'Drawn workplace polygon (min 3 points). Send [] to clear. Preferred geofence.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeofencePointDto)
  geofencePolygon?: GeofencePointDto[];

  /** @deprecated Prefer geofencePolygon */
  @ApiPropertyOptional({ example: 30.0444 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  geofenceLat?: number;

  /** @deprecated Prefer geofencePolygon */
  @ApiPropertyOptional({ example: 31.2357 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  geofenceLng?: number;

  /** @deprecated Prefer geofencePolygon */
  @ApiPropertyOptional({ example: 150 })
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
