import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
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
