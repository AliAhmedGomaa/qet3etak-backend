import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BroadcastDto, SavePushSubscriptionDto } from './dto/push.dto';
import { PushService } from './push.service';
import { examples } from '../swagger/examples';
import { UnsubscribePushDto } from '../swagger/common.dto';

@Controller()
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('push/vapid-public-key')
  @ApiTags('Wholesale — Push')
  @ApiOperation({ summary: 'Get the VAPID public key for push subscriptions' })
  @ApiOkResponse({
    description: 'VAPID public key',
    schema: { example: examples('vapidPublicKey').vapidPublicKey.value },
  })
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  vapidKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('wholesale/push/subscribe')
  @ApiTags('Wholesale — Push')
  @ApiOperation({ summary: 'Save a push subscription (shop owner)' })
  @ApiBody({
    type: SavePushSubscriptionDto,
    examples: examples('pushSubscribeRequest'),
  })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    return this.pushService.saveSubscription(user.userId, dto, 'SHOP_OWNER');
  }

  @Delete('wholesale/push/subscribe')
  @ApiTags('Wholesale — Push')
  @ApiOperation({ summary: 'Remove a push subscription (shop owner)' })
  @ApiBody({
    type: UnsubscribePushDto,
    examples: examples('pushUnsubscribeRequest'),
  })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body() body: UnsubscribePushDto,
  ) {
    return this.pushService.removeSubscription(user.userId, body.endpoint);
  }

  @Post('admin/push/subscribe')
  @ApiTags('Admin — Push')
  @ApiOperation({ summary: 'Save a push subscription (admin)' })
  @ApiBody({
    type: SavePushSubscriptionDto,
    examples: examples('pushSubscribeRequest'),
  })
  @Roles(UserRole.ADMIN)
  subscribeAdmin(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    return this.pushService.saveSubscription(user.userId, dto, 'ADMIN');
  }

  @Delete('admin/push/subscribe')
  @ApiTags('Admin — Push')
  @ApiOperation({ summary: 'Remove a push subscription (admin)' })
  @ApiBody({
    type: UnsubscribePushDto,
    examples: examples('pushUnsubscribeRequest'),
  })
  @Roles(UserRole.ADMIN)
  unsubscribeAdmin(
    @CurrentUser() user: AuthUser,
    @Body() body: UnsubscribePushDto,
  ) {
    return this.pushService.removeSubscription(user.userId, body.endpoint);
  }

  @Post('admin/push/broadcast')
  @ApiTags('Admin — Push')
  @ApiOperation({ summary: 'Broadcast a notification to all shop owners' })
  @ApiBody({ type: BroadcastDto, examples: examples('broadcastRequest') })
  @ApiOkResponse({
    description: 'Broadcast result',
    schema: { example: examples('broadcastResponse').broadcastResponse.value },
  })
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
