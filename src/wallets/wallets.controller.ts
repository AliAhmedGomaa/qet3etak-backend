import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../common/enums/user.enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RecordPaymentDto, SetCreditLimitDto } from '../orders/dto/order.dto';
import { WalletsService } from './wallets.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('wholesale/wallet')
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  async myWallet(@CurrentUser() user: AuthUser) {
    const wallet = await this.walletsService.getByShopId(user.userId);
    return this.walletsService.toView(wallet);
  }

  @Get('admin/wallets')
  @Roles(UserRole.ADMIN)
  listWallets() {
    return this.walletsService.listShopWallets();
  }

  @Get('admin/wallets/:shopId')
  @Roles(UserRole.ADMIN)
  async getWallet(@Param('shopId') shopId: string) {
    const wallet = await this.walletsService.getByShopId(shopId);
    return this.walletsService.toView(wallet);
  }

  @Patch('admin/wallets/:shopId/credit-limit')
  @Roles(UserRole.ADMIN)
  async setLimit(
    @Param('shopId') shopId: string,
    @Body() dto: SetCreditLimitDto,
    @CurrentUser() admin: AuthUser,
  ) {
    const wallet = await this.walletsService.setCreditLimit(
      shopId,
      dto.creditLimit,
      admin.userId,
      dto.note,
    );
    return this.walletsService.toView(wallet);
  }

  @Post('admin/wallets/:shopId/payments')
  @Roles(UserRole.ADMIN)
  async recordPayment(
    @Param('shopId') shopId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() admin: AuthUser,
  ) {
    const wallet = await this.walletsService.recordPayment(
      shopId,
      dto.amount,
      admin.userId,
      dto.note,
    );
    return this.walletsService.toView(wallet);
  }
}
