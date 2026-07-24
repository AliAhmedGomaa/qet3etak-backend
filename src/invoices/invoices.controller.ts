import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { InvoiceStatus } from '../common/enums/invoice.enums';
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
import { InvoicesService } from './invoices.service';

@Controller()
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('wholesale/invoices')
  @ApiTags('Wholesale — Invoices')
  @ApiOperation({ summary: 'List my shop invoices (paginated + search)' })
  @ApiOkResponse({ description: 'Paginated invoices' })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myInvoices(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.invoicesService.listForShop(
      user.userId,
      query.page,
      query.limit,
      query.q,
    );
  }

  @Get('wholesale/invoices/by-order/:orderId')
  @ApiTags('Wholesale — Invoices')
  @ApiOperation({ summary: 'Get invoice for one of my orders' })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myInvoiceByOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.invoicesService.getByOrderForShop(user.userId, orderId);
  }

  @Get('wholesale/invoices/:id')
  @ApiTags('Wholesale — Invoices')
  @ApiOperation({ summary: 'Get one of my invoices by ID' })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.getForShop(user.userId, id);
  }

  @Get('admin/invoices')
  @ApiTags('Admin — Invoices')
  @ApiOperation({
    summary: 'List all invoices (paginated, search, optional status filter)',
  })
  @AdminOnly()
  listInvoices(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginatedStatusQueryDto,
  ) {
    let status: InvoiceStatus | undefined;
    if (query.status) {
      const allowed = Object.values(InvoiceStatus) as string[];
      if (!allowed.includes(query.status)) {
        throw new BadRequestException('Invalid invoice status');
      }
      status = query.status as InvoiceStatus;
    }
    const scope = effectiveBranchScope(user, query.branchId);
    return this.invoicesService.listAll(
      query.page,
      query.limit,
      query.q,
      status,
      scope,
    );
  }

  @Get('admin/invoices/:id')
  @ApiTags('Admin — Invoices')
  @ApiOperation({ summary: 'Get invoice by ID (admin)' })
  @AdminOnly()
  getInvoice(@Param('id') id: string) {
    return this.invoicesService.getById(id);
  }

  @Patch('admin/invoices/:id/void')
  @ApiTags('Admin — Invoices')
  @ApiOperation({ summary: 'Void an invoice (admin)' })
  @AdminOnly()
  voidInvoice(@Param('id') id: string) {
    return this.invoicesService.voidInvoice(id);
  }
}
