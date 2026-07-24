import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../../common/enums/user.enums';

/** Roles assignable via the admin users API (never SHOP_OWNER). */
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

  @ApiProperty({
    enum: ASSIGNABLE_STAFF_ROLES,
    example: UserRole.STAFF,
    description: 'Admin-panel role (SHOP_OWNER is not allowed)',
  })
  @IsIn(ASSIGNABLE_STAFF_ROLES)
  role!: UserRole;

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
