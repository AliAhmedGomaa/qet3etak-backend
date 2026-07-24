import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'عمليات' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    example: 'OPS',
    description: 'Stable unique uppercase slug (A-Z, 0-9, underscore)',
  })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/, {
    message: 'code must be uppercase alphanumeric (e.g. OPS, BRANCH_OPS)',
  })
  code!: string;

  @ApiPropertyOptional({ example: 'دور مخصص لفريق العمليات' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['admin.panel'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    example: true,
    description: 'Allow login to the admin dashboard',
  })
  @IsOptional()
  @IsBoolean()
  adminPanel?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
