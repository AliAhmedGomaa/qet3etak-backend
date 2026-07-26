import {
  Body,
  Controller,
  Delete,
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
import {
  AdminOnly,
  UnscopedAdminOnly,
} from '../auth/decorators/admin-only.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PaginationQueryDto } from '../common/pagination';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@ApiTags('Admin — Roles')
@ApiBearerAuth('JWT')
@Controller('admin/roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AdminRolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('catalog')
  @AdminOnly()
  @RequirePermissions('roles.read', 'roles.manage', 'admin.panel')
  @ApiOperation({ summary: 'Permission catalog for the roles matrix UI' })
  catalog() {
    return this.rolesService.permissionCatalog();
  }

  /** Staff user form needs this — not super-admin only. */
  @Get()
  @UnscopedAdminOnly()
  @RequirePermissions('roles.read', 'roles.manage', 'users.read', 'users.create', 'users.update')
  @ApiOperation({
    summary: 'List roles (system + custom)',
    description:
      'Returns role entities. Includes inactive when includeInactive=1. ' +
      'Back-compat fields: role/labelAr/canAccessAdmin.',
  })
  async list(
    @Query() query: PaginationQueryDto,
  ) {
    const result = await this.rolesService.list(
      query.page,
      query.limit ?? 100,
      query.q,
      {
        includeInactive:
          query.includeInactive === '1' || query.includeInactive === 'true',
        adminPanelOnly:
          query.adminPanelOnly === '1' || query.adminPanelOnly === 'true',
      },
    );
    return {
      ...result,
      items: result.items.map((r) => this.rolesService.toView(r)),
    };
  }

  @Post()
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Create a custom role' })
  async create(@Body() dto: CreateRoleDto) {
    const role = await this.rolesService.create(dto);
    return this.rolesService.toView(role);
  }

  @Get(':id')
  @AdminOnly()
  @RequirePermissions('roles.read', 'roles.manage')
  @ApiOperation({ summary: 'Get a role by id' })
  async get(@Param('id') id: string) {
    const role = await this.rolesService.findByIdOrFail(id);
    return this.rolesService.toView(role);
  }

  @Patch(':id')
  @RequirePermissions('roles.manage')
  @ApiOperation({
    summary: 'Update a role',
    description:
      'System roles: name/description/permissions editable; code/delete locked.',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.rolesService.update(id, dto);
    return this.rolesService.toView(role);
  }

  @Delete(':id')
  @RequirePermissions('roles.manage')
  @ApiOperation({
    summary: 'Delete a custom role (blocked if system or in-use)',
  })
  async remove(@Param('id') id: string) {
    await this.rolesService.remove(id);
    return { ok: true };
  }
}
