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
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ReturnRequestStatus } from '../common/enums/return.enums';
import { UserRole } from '../common/enums/user.enums';
import {
  PaginatedStatusQueryDto,
  PaginationQueryDto,
} from '../common/pagination';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { effectiveBranchScope } from '../common/branch-scope';
import {
  ApproveReturnDto,
  CreateReturnRequestDto,
  RejectReturnDto,
} from './dto/return.dto';
import { ReturnsService } from './returns.service';

@Controller()
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post('wholesale/returns')
  @ApiTags('Wholesale — Returns')
  @ApiOperation({
    summary: 'Create a return request for a delivered order',
    description:
      'Shop owners may request a full or partial return only when the order status is DELIVERED. Quantities cannot exceed remaining returnable units.',
  })
  @ApiBody({ type: CreateReturnRequestDto })
  @ApiOkResponse({ description: 'Created return request' })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReturnRequestDto,
  ) {
    return this.returnsService.create(user.userId, dto);
  }

  @Get('wholesale/returns')
  @ApiTags('Wholesale — Returns')
  @ApiOperation({ summary: 'List my return requests (paginated)' })
  @ApiOkResponse({ description: 'Paginated return requests' })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myReturns(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.returnsService.listForShop(
      user.userId,
      query.page,
      query.limit,
    );
  }

  @Get('wholesale/returns/:id')
  @ApiTags('Wholesale — Returns')
  @ApiOperation({ summary: 'Get a return request I own' })
  @ApiOkResponse({ description: 'Return request detail' })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myReturn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.returnsService.getForShop(user.userId, id);
  }

  @Get('admin/returns')
  @ApiTags('Admin — Returns')
  @ApiOperation({
    summary: 'List all return requests (filter by status, search)',
  })
  @ApiOkResponse({ description: 'Paginated return requests' })
  @AdminOnly()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginatedStatusQueryDto,
  ) {
    if (
      query.status &&
      !Object.values(ReturnRequestStatus).includes(
        query.status as ReturnRequestStatus,
      )
    ) {
      throw new BadRequestException('Invalid status filter');
    }
    const scope = effectiveBranchScope(user, query.branchId);
    return this.returnsService.listAll(
      query.status as ReturnRequestStatus | undefined,
      query.page,
      query.limit,
      query.q,
      scope,
    );
  }

  @Get('admin/returns/pending-count')
  @ApiTags('Admin — Returns')
  @ApiOperation({
    summary: 'Count of PENDING return requests (nav badge)',
  })
  @ApiOkResponse({ description: '{ count: number }' })
  @AdminOnly()
  pendingCount() {
    return this.returnsService.pendingCount();
  }

  @Get('admin/returns/:id')
  @ApiTags('Admin — Returns')
  @ApiOperation({ summary: 'Get a return request (admin)' })
  @ApiOkResponse({ description: 'Return request detail' })
  @AdminOnly()
  get(@Param('id') id: string) {
    return this.returnsService.getById(id);
  }

  @Patch('admin/returns/:id/approve')
  @ApiTags('Admin — Returns')
  @ApiOperation({
    summary: 'Approve a return request',
    description:
      'Restocks returned quantities. For CREDIT orders, reduces shop wallet debt via ADJUSTMENT. COD orders get no wallet change.',
  })
  @ApiBody({ type: ApproveReturnDto })
  @ApiOkResponse({ description: 'Approved return request' })
  @AdminOnly()
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveReturnDto,
  ) {
    return this.returnsService.approve(id, user.userId, dto);
  }

  @Patch('admin/returns/:id/reject')
  @ApiTags('Admin — Returns')
  @ApiOperation({ summary: 'Reject a return request' })
  @ApiBody({ type: RejectReturnDto })
  @ApiOkResponse({ description: 'Rejected return request' })
  @AdminOnly()
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectReturnDto,
  ) {
    return this.returnsService.reject(id, user.userId, dto);
  }
}
