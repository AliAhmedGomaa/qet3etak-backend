import {
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
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto } from '../common/pagination';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CheckoutDto, UpdateOrderStatusDto } from './dto/order.dto';
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

  @Get('admin/orders')
  @ApiTags('Admin — Orders')
  @ApiOperation({ summary: 'List all orders (admin, paginated + search)' })
  @ApiOkResponse({
    description: 'Paginated orders',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @Roles(UserRole.ADMIN)
  listOrders(@Query() query: PaginationQueryDto) {
    return this.ordersService.listAll(query.page, query.limit, query.q);
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
  @Roles(UserRole.ADMIN)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }
}
