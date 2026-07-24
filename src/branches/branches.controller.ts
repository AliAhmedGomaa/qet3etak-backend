import {
  BadRequestException,
  Body,
  Controller,
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
import { AdminOnly, SuperAdminOnly } from '../auth/decorators/admin-only.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BranchStatus } from '../common/enums/branch.enums';
import { UserRole } from '../common/enums/user.enums';
import { PaginatedStatusQueryDto } from '../common/pagination';
import { BranchesService } from './branches.service';
import {
  AssignBranchManagerDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './dto/branch.dto';

@ApiTags('Admin — Branches')
@ApiBearerAuth('JWT')
@Controller('admin/branches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get('options')
  @AdminOnly()
  @ApiOperation({
    summary: 'Active branches as id/name options (shop form, filters)',
  })
  listOptions(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.BRANCH_MANAGER && user.branchId) {
      return this.branchesService.getById(user.branchId).then((b) => [
        {
          id: b['id'] as string,
          name: b['name'] as string,
          code: b['code'] as string,
          city: b['city'] as string,
        },
      ]);
    }
    return this.branchesService.listActiveOptions();
  }

  @Get()
  @SuperAdminOnly()
  @ApiOperation({ summary: 'List branches (paginated, searchable)' })
  list(@Query() query: PaginatedStatusQueryDto) {
    let status: BranchStatus | undefined;
    if (query.status) {
      if (!Object.values(BranchStatus).includes(query.status as BranchStatus)) {
        throw new BadRequestException(
          `status must be one of: ${Object.values(BranchStatus).join(', ')}`,
        );
      }
      status = query.status as BranchStatus;
    }
    return this.branchesService.list(
      query.page,
      query.limit,
      query.q,
      status,
    );
  }

  @Post()
  @SuperAdminOnly()
  @ApiOperation({ summary: 'Create a branch' })
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Get(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get a branch by id' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (
      user.role === UserRole.BRANCH_MANAGER &&
      user.branchId &&
      user.branchId !== id
    ) {
      throw new BadRequestException('You can only view your own branch');
    }
    return this.branchesService.getById(id);
  }

  @Patch(':id')
  @SuperAdminOnly()
  @ApiOperation({ summary: 'Update a branch' })
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @Patch(':id/manager')
  @SuperAdminOnly()
  @ApiOperation({
    summary:
      'Assign or clear branch manager (sets user.branchId + BRANCH_MANAGER role)',
  })
  assignManager(
    @Param('id') id: string,
    @Body() dto: AssignBranchManagerDto,
  ) {
    return this.branchesService.assignManager(id, dto);
  }
}
