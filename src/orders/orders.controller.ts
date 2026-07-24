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

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('wholesale/orders/checkout')
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.ordersService.checkout(user.userId, dto);
  }

  @Get('wholesale/orders')
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myOrders(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.ordersService.listForShop(user.userId, query.page, query.limit);
  }

  @Get('wholesale/orders/:id')
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.getForShop(user.userId, id);
  }

  @Get('admin/orders')
  @Roles(UserRole.ADMIN)
  listOrders(@Query() query: PaginationQueryDto) {
    return this.ordersService.listAll(query.page, query.limit, query.q);
  }

  @Patch('admin/orders/:id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }
}
