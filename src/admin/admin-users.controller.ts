import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UnscopedAdminOnly } from '../auth/decorators/admin-only.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  UserRole,
  UserStatus,
} from '../common/enums/user.enums';
import { PaginatedStatusQueryDto } from '../common/pagination';
import { RolesService } from '../roles/roles.service';
import { UsersService } from '../users/users.service';
import {
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from './dto/admin-user.dto';

@ApiTags('Admin — Users & Roles')
@ApiBearerAuth('JWT')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@UnscopedAdminOnly()
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  @Get('users')
  @ApiOperation({
    summary: 'List admin-panel staff users (excludes shop owners)',
  })
  async listUsers(@Query() query: PaginatedStatusQueryDto) {
    let status: UserStatus | undefined;
    if (query.status) {
      if (!Object.values(UserStatus).includes(query.status as UserStatus)) {
        throw new BadRequestException(
          `status must be one of: ${Object.values(UserStatus).join(', ')}`,
        );
      }
      status = query.status as UserStatus;
    }

    const roleCode = query.role?.trim() || undefined;
    if (roleCode) {
      const role = await this.rolesService.findByCode(roleCode);
      if (!role || !role.adminPanel) {
        throw new BadRequestException(`Unknown or non-panel role: ${roleCode}`);
      }
    }

    const result = await this.usersService.findStaff(
      roleCode,
      status,
      query.page,
      query.limit,
      query.q,
      query.roleId,
    );
    return {
      ...result,
      items: result.items.map((u) => this.toStaffView(u)),
    };
  }

  @Post('users')
  @ApiOperation({ summary: 'Create an admin-panel staff user' })
  async createUser(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateAdminUserDto,
  ) {
    if (!dto.roleId && !dto.role) {
      throw new BadRequestException('roleId or role is required');
    }

    const role = await this.resolveAssignableRole(dto.roleId, dto.role);
    this.assertCanAssignRole(actor, role.code);

    const phone = dto.phone.trim();
    const existing = await this.usersService.findByPhone(phone);
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const status =
      this.resolveStatus(dto.status, undefined) ?? UserStatus.APPROVED;
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      fullName: dto.fullName.trim(),
      shopName: '—',
      phone,
      city: '—',
      address: '—',
      commercialRegPhotoUrl: '/uploads/admin-placeholder.png',
      passwordHash,
      roleId: String(role._id),
      role: role.code,
      status,
    });

    return this.toStaffView(user);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get an admin-panel staff user by id' })
  async getUser(@Param('id') id: string) {
    const user = await this.usersService.findStaffByIdOrFail(id);
    return this.toStaffView(user);
  }

  @Patch('users/:id')
  @ApiOperation({
    summary: 'Update staff profile, role, password, or active status',
  })
  async updateUser(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    const existing = await this.usersService.findStaffByIdOrFail(id);

    let nextRoleCode = String(existing.role);
    let nextRoleId: string | undefined;

    if (dto.roleId !== undefined || dto.role !== undefined) {
      const role = await this.resolveAssignableRole(dto.roleId, dto.role);
      this.assertCanAssignRole(actor, role.code);
      nextRoleCode = role.code;
      nextRoleId = String(role._id);
    }

    const nextStatus = this.resolveStatus(dto.status, dto.isActive);

    await this.guardLastAdmin(existing, nextRoleCode, nextStatus);

    const passwordHash =
      dto.password !== undefined
        ? await bcrypt.hash(dto.password, 10)
        : undefined;

    const user = await this.usersService.updateStaff(id, {
      fullName: dto.fullName,
      phone: dto.phone,
      passwordHash,
      roleId: nextRoleId,
      role: nextRoleId ? nextRoleCode : undefined,
      status: nextStatus,
    });

    return this.toStaffView(user);
  }

  @Delete('users/:id')
  @ApiOperation({
    summary: 'Delete a staff user (blocked if they are the last active ADMIN)',
  })
  async removeUser(@Param('id') id: string) {
    const existing = await this.usersService.findStaffByIdOrFail(id);
    if (
      existing.role === UserRole.ADMIN &&
      existing.status === UserStatus.APPROVED
    ) {
      const activeAdmins = await this.usersService.countActiveAdmins();
      if (activeAdmins <= 1) {
        throw new ConflictException(
          'Cannot delete the last active ADMIN user',
        );
      }
    }
    await this.usersService.removeStaff(id);
    return { ok: true };
  }

  private async resolveAssignableRole(roleId?: string, roleCode?: string) {
    const role = roleId
      ? await this.rolesService.findByIdOrFail(roleId)
      : await this.rolesService.findByCodeOrFail(
          (roleCode ?? '').toUpperCase(),
        );

    if (!role.adminPanel) {
      throw new BadRequestException(
        'Cannot assign a non-admin-panel role to staff',
      );
    }
    if (!role.isActive) {
      throw new BadRequestException('Role is inactive');
    }
    if (role.code === UserRole.SHOP_OWNER) {
      throw new BadRequestException('SHOP_OWNER cannot be assigned via staff API');
    }
    return role;
  }

  /** Only super-admins may grant the ADMIN role. */
  private assertCanAssignRole(actor: AuthUser, roleCode: string): void {
    if (roleCode === UserRole.ADMIN && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can assign the ADMIN role');
    }
  }

  private resolveStatus(
    status?: UserStatus,
    isActive?: boolean,
  ): UserStatus | undefined {
    if (isActive === true) return UserStatus.APPROVED;
    if (isActive === false) return UserStatus.SUSPENDED;
    if (status === undefined) return undefined;
    if (
      status !== UserStatus.APPROVED &&
      status !== UserStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Staff status must be APPROVED or SUSPENDED',
      );
    }
    return status;
  }

  private async guardLastAdmin(
    existing: { role: string; status: UserStatus },
    nextRole: string,
    nextStatus?: UserStatus,
  ): Promise<void> {
    const wasActiveAdmin =
      existing.role === UserRole.ADMIN &&
      existing.status === UserStatus.APPROVED;
    if (!wasActiveAdmin) return;

    const demoting = nextRole !== UserRole.ADMIN;
    const deactivating =
      nextStatus !== undefined && nextStatus !== UserStatus.APPROVED;
    if (!demoting && !deactivating) return;

    const activeAdmins = await this.usersService.countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new ConflictException(
        'Cannot demote or deactivate the last active ADMIN user',
      );
    }
  }

  private toStaffView(user: { toJSON: () => unknown }) {
    const json = user.toJSON() as Record<string, unknown>;
    const status = json.status as UserStatus;
    return {
      id: json.id,
      fullName: json.fullName,
      phone: json.phone,
      role: json.role,
      roleId: json.roleId ? String(json.roleId) : null,
      status,
      isActive: status === UserStatus.APPROVED,
      branchId: json.branchId ? String(json.branchId) : null,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }
}
