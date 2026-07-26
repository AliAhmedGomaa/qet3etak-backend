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
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
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
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /** Public — browsers need this before/during Notification permission. */
  @Get('push/vapid-public-key')
  @ApiTags('Wholesale — Push')
  @ApiOperation({ summary: 'Get the VAPID public key for push subscriptions' })
  @ApiOkResponse({
    description: 'VAPID public key',
    schema: { example: examples('vapidPublicKey').vapidPublicKey.value },
  })
  vapidKey() {
    return {
      publicKey: this.pushService.getPublicKey(),
      enabled: this.pushService.isEnabled(),
    };
  }

  @Post('wholesale/push/subscribe')
  @ApiTags('Wholesale — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Save a push subscription (shop owner)' })
  @ApiBody({
    type: SavePushSubscriptionDto,
    examples: examples('pushSubscribeRequest'),
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Remove a push subscription (shop owner)' })
  @ApiBody({
    type: UnsubscribePushDto,
    examples: examples('pushUnsubscribeRequest'),
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Save a push subscription (admin)' })
  @ApiBody({
    type: SavePushSubscriptionDto,
    examples: examples('pushSubscribeRequest'),
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  subscribeAdmin(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    return this.pushService.saveSubscription(user.userId, dto, 'ADMIN');
  }

  @Delete('admin/push/subscribe')
  @ApiTags('Admin — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Remove a push subscription (admin)' })
  @ApiBody({
    type: UnsubscribePushDto,
    examples: examples('pushUnsubscribeRequest'),
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  unsubscribeAdmin(
    @CurrentUser() user: AuthUser,
    @Body() body: UnsubscribePushDto,
  ) {
    return this.pushService.removeSubscription(user.userId, body.endpoint);
  }

  @Post('admin/push/broadcast')
  @ApiTags('Admin — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary:
      'Broadcast a notification to selected shop owners (or all if shopIds empty)',
  })
  @ApiBody({ type: BroadcastDto, examples: examples('broadcastRequest') })
  @ApiOkResponse({
    description: 'Broadcast result',
    schema: { example: examples('broadcastResponse').broadcastResponse.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  async broadcast(@Body() dto: BroadcastDto) {
    return this.pushService.broadcastToShopOwners(
      {
        title: dto.title,
        body: dto.body,
        url: dto.url || '/home',
        tag: 'broadcast',
      },
      dto.shopIds,
    );
  }

  @Get('admin/push/debug')
  @ApiTags('Admin — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary:
      'Push diagnostics: VAPID status + subscription counts (for debugging)',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  debug() {
    return this.pushService.debugStats();
  }

  @Post('admin/push/test')
  @ApiTags('Admin — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Send a test push to all ADMIN subscriptions (and optionally self)',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  async test(@CurrentUser() user: AuthUser) {
    const title = 'اختبار إشعار الإدارة';
    const body = 'رسالة تجريبية — إذا وصلتك فهذا يعني أن اشتراك الإدارة يعمل';
    const toAdmins = await this.pushService.notifyAdmins({
      title,
      body,
      url: '/reports',
      tag: 'push-test-admin',
    });
    const toSelf = await this.pushService.notifyUser(user.userId, {
      title: 'اختبار إشعار لك',
      body: 'رسالة تجريبية مباشرة لحسابك',
      url: '/reports',
      tag: 'push-test-self',
    });
    return {
      enabled: this.pushService.isEnabled(),
      sentToAdmins: toAdmins,
      sentToSelf: toSelf,
    };
  }
}
