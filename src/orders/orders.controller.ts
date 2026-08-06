import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto, DeliveryOrdersQueryDto } from '../common/pagination';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { DeliveryOnly } from '../auth/decorators/delivery-only.decorator';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { effectiveBranchScope } from '../common/branch-scope';
import { imageUploadOptions } from '../common/multer-image';
import {
  AssignOrderDeliveryDto,
  CheckoutDto,
  ReorderDto,
  UpdateOrderStatusDto,
  WalkInSaleDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';
import { examples } from '../swagger/examples';

@Controller()
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('wholesale/orders/checkout')
  @ApiTags('Wholesale — Orders')
  @ApiOperation({ summary: 'Checkout the cart and create an order' })
  @ApiBody({
    type: CheckoutDto,
    examples: examples('checkoutRequest', 'checkoutCreditRequest'),
  })
  @ApiOkResponse({
    description: 'Order created',
    schema: { example: examples('orderResponse').orderResponse.value },
  })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.ordersService.checkout(user.userId, dto);
  }

  @Get('wholesale/orders')
  @ApiTags('Wholesale — Orders')
  @ApiOperation({ summary: 'List my shop orders (paginated)' })
  @ApiOkResponse({
    description: 'Paginated orders',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myOrders(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.ordersService.listForShop(user.userId, query.page, query.limit);
  }

  @Get('wholesale/orders/:id')
  @ApiTags('Wholesale — Orders')
  @ApiOperation({ summary: 'Get one of my orders by ID' })
  @ApiOkResponse({
    description: 'Order',
    schema: { example: examples('orderResponse').orderResponse.value },
  })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.getForShop(user.userId, id);
  }

  @Post('wholesale/orders/:id/reorder')
  @ApiTags('Wholesale — Orders')
  @ApiOperation({
    summary:
      'Reorder a past order (live prices/stock; skips unavailable items with warnings)',
  })
  @ApiBody({ type: ReorderDto, required: false })
  @ApiOkResponse({
    description: 'New order plus optional warnings about skipped/changed lines',
  })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.ordersService.reorder(user.userId, id, dto ?? {});
  }

  @Get('admin/orders')
  @ApiTags('Admin — Orders')
  @ApiOperation({ summary: 'List all orders (admin, paginated + search)' })
  @ApiOkResponse({
    description: 'Paginated orders',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @AdminOnly()
  listOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    const scope = effectiveBranchScope(user, query.branchId);
    return this.ordersService.listAll(
      query.page,
      query.limit,
      query.q,
      scope,
    );
  }

  @Get('admin/sales/today')
  @ApiTags('Admin — Sales')
  @ApiOperation({ summary: 'Parts / line items sold today (Cairo day)' })
  @AdminOnly()
  soldToday(
    @CurrentUser() user: AuthUser,
    @Query('branchId') branchId?: string,
  ) {
    const scope = effectiveBranchScope(user, branchId);
    return this.ordersService.soldToday(scope);
  }

  @Post('admin/sales/walk-in')
  @ApiTags('Admin — Sales')
  @ApiOperation({ summary: 'Record an in-store sale (walk-in or registered shop)' })
  @ApiBody({ type: WalkInSaleDto })
  @AdminOnly()
  walkInSale(
    @CurrentUser() user: AuthUser,
    @Body() dto: WalkInSaleDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = effectiveBranchScope(user, branchId);
    return this.ordersService.createWalkInSale(user.userId, dto, scope);
  }

  @Patch('admin/orders/:id/status')
  @ApiTags('Admin — Orders')
  @ApiOperation({ summary: 'Update order status (admin)' })
  @ApiBody({
    type: UpdateOrderStatusDto,
    examples: examples('updateOrderStatusRequest'),
  })
  @ApiOkResponse({
    description: 'Updated order',
    schema: { example: examples('orderResponse').orderResponse.value },
  })
  @AdminOnly()
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }

  @Patch('admin/orders/:id/delivery')
  @ApiTags('Admin — Orders')
  @ApiOperation({
    summary: 'Assign a delivery guy and calculate their fee for this order',
  })
  @ApiBody({ type: AssignOrderDeliveryDto })
  @AdminOnly()
  assignDelivery(
    @Param('id') id: string,
    @Body() dto: AssignOrderDeliveryDto,
  ) {
    return this.ordersService.assignDelivery(id, dto);
  }

  @Get('delivery/orders')
  @ApiTags('Delivery — Orders')
  @ApiOperation({ summary: 'List orders assigned to the current courier' })
  @DeliveryOnly()
  listDeliveryOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: DeliveryOrdersQueryDto,
  ) {
    const tab =
      query.tab === 'delivered' || query.tab === 'all' || query.tab === 'active'
        ? query.tab
        : 'active';
    return this.ordersService.listForDeliveryGuy(
      user.userId,
      query.page,
      query.limit,
      tab,
    );
  }

  @Get('delivery/orders/:id')
  @ApiTags('Delivery — Orders')
  @ApiOperation({ summary: 'Get one assigned order' })
  @DeliveryOnly()
  getDeliveryOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.getForDeliveryGuy(user.userId, id);
  }

  @Patch('delivery/orders/:id/ship')
  @ApiTags('Delivery — Orders')
  @ApiOperation({ summary: 'Mark an assigned order as SHIPPED' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { note: { type: 'string' } },
    },
    required: false,
  })
  @DeliveryOnly()
  markShipped(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body?: { note?: string },
  ) {
    return this.ordersService.markShippedByCourier(
      user.userId,
      id,
      body?.note,
    );
  }

  @Patch('delivery/orders/:id/deliver')
  @ApiTags('Delivery — Orders')
  @ApiOperation({
    summary: 'Mark an assigned order as delivered (requires proof photo)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: {
        note: { type: 'string' },
        photo: {
          type: 'string',
          format: 'binary',
          description: 'Proof-of-delivery photo (jpeg/png/webp, max 3MB)',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', imageUploadOptions('delivery-proof')),
  )
  @DeliveryOnly()
  markDelivered(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body?: { note?: string },
  ) {
    return this.ordersService.markDeliveredByCourier(
      user.userId,
      id,
      body?.note,
      file?.filename,
    );
  }

  @Get('delivery/earnings')
  @ApiTags('Delivery — Earnings')
  @ApiOperation({
    summary: 'Courier earnings dashboard (lifetime + selected month)',
  })
  @DeliveryOnly()
  earnings(
    @CurrentUser() user: AuthUser,
    @Query('month') month?: string,
  ) {
    return this.ordersService.earningsForDeliveryGuy(user.userId, month);
  }
}
