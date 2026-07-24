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
  ADMIN_PANEL_ROLES,
  ADMIN_ROLE_DEFINITIONS,
  UserRole,
  UserStatus,
  isAdminPanelRole,
} from '../common/enums/user.enums';
import { PaginatedStatusQueryDto } from '../common/pagination';
import { UsersService } from '../users/users.service';
import {
  ASSIGNABLE_STAFF_ROLES,
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from './dto/admin-user.dto';

@ApiTags('Admin — Users & Roles')
@ApiBearerAuth('JWT')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@UnscopedAdminOnly()
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('roles')
  @ApiOperation({ summary: 'List admin-panel role definitions' })
  listRoles() {
    return {
      items: ADMIN_ROLE_DEFINITIONS.map((r) => ({
        ...r,
        canAccessAdmin: true,
      })),
    };
  }

  @Get('users')
  @ApiOperation({
    summary: 'List admin-panel staff users (excludes shop owners)',
  })
  async listUsers(@Query() query: PaginatedStatusQueryDto) {
    let role: UserRole | undefined;
    if (query.role) {
      if (!isAdminPanelRole(query.role as UserRole)) {
        throw new BadRequestException(
          `role must be one of: ${ADMIN_PANEL_ROLES.join(', ')}`,
        );
      }
      role = query.role as UserRole;
    }

    let status: UserStatus | undefined;
    if (query.status) {
      if (!Object.values(UserStatus).includes(query.status as UserStatus)) {
        throw new BadRequestException(
          `status must be one of: ${Object.values(UserStatus).join(', ')}`,
        );
      }
      status = query.status as UserStatus;
    }

    const result = await this.usersService.findStaff(
      role,
      status,
      query.page,
      query.limit,
      query.q,
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
    this.assertAssignableRole(dto.role);
    this.assertCanAssignRole(actor, dto.role);

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
      role: dto.role,
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

    if (dto.role !== undefined) {
      this.assertAssignableRole(dto.role);
      this.assertCanAssignRole(actor, dto.role);
    }

    const nextRole = dto.role ?? existing.role;
    const nextStatus = this.resolveStatus(dto.status, dto.isActive);

    await this.guardLastAdmin(existing, nextRole, nextStatus);

    const passwordHash =
      dto.password !== undefined
        ? await bcrypt.hash(dto.password, 10)
        : undefined;

    const user = await this.usersService.updateStaff(id, {
      fullName: dto.fullName,
      phone: dto.phone,
      passwordHash,
      role: dto.role,
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

  private assertAssignableRole(role: UserRole): void {
    if (!(ASSIGNABLE_STAFF_ROLES as readonly UserRole[]).includes(role)) {
      throw new BadRequestException(
        `role must be one of: ${ASSIGNABLE_STAFF_ROLES.join(', ')}`,
      );
    }
  }

  /** Only super-admins may grant the ADMIN role. */
  private assertCanAssignRole(actor: AuthUser, role: UserRole): void {
    if (role === UserRole.ADMIN && actor.role !== UserRole.ADMIN) {
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
    existing: { role: UserRole; status: UserStatus },
    nextRole: UserRole,
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
      status,
      isActive: status === UserStatus.APPROVED,
      branchId: json.branchId ? String(json.branchId) : null,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }
}
