import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../../common/enums/user.enums';

/** Legacy assignable staff role codes (never SHOP_OWNER). */
export const ASSIGNABLE_STAFF_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.STAFF,
  UserRole.BRANCH_MANAGER,
] as const;

export class CreateAdminUserDto {
  @ApiProperty({ example: 'Sara Ahmed' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: '0501112233' })
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone!: string;

  @ApiProperty({ example: 'Staff123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({
    example: '665f1a2b3c4d5e6f7a8b9c0d',
    description: 'Preferred: Role document id',
  })
  @IsOptional()
  @IsMongoId()
  roleId?: string;

  @ApiPropertyOptional({
    enum: ASSIGNABLE_STAFF_ROLES,
    example: UserRole.STAFF,
    description: 'Role code (used when roleId omitted). Still supported.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  role?: string;

  @ApiPropertyOptional({
    enum: [UserStatus.APPROVED, UserStatus.SUSPENDED],
    example: UserStatus.APPROVED,
    description: 'Defaults to APPROVED (active)',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateAdminUserDto extends PartialType(CreateAdminUserDto) {
  @ApiPropertyOptional({ example: 'Staff123!', minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({
    description: 'Shorthand for status: true → APPROVED, false → SUSPENDED',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
