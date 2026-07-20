import {
  Body,
  Controller,
  Delete,
  Get,
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
import { BroadcastDto, SavePushSubscriptionDto } from './dto/push.dto';
import { PushService } from './push.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('push/vapid-public-key')
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  vapidKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('wholesale/push/subscribe')
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    return this.pushService.saveSubscription(user.userId, dto);
  }

  @Delete('wholesale/push/subscribe')
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body() body: { endpoint?: string },
  ) {
    return this.pushService.removeSubscription(user.userId, body.endpoint);
  }

  @Post('admin/push/broadcast')
  @Roles(UserRole.ADMIN)
  async broadcast(@Body() dto: BroadcastDto) {
    const sent = await this.pushService.broadcastToShopOwners({
      title: dto.title,
      body: dto.body,
      url: dto.url || '/home',
      tag: 'broadcast',
    });
    return { sent };
  }
}
