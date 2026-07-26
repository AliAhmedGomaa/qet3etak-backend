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
import { DeliveryOnly } from '../auth/decorators/delivery-only.decorator';
import { EmployeeOnly } from '../auth/decorators/employee-only.decorator';
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
  @Post('employee/push/subscribe')
  @ApiTags('Employee — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Save a push subscription (employee)' })
  @ApiBody({
    type: SavePushSubscriptionDto,
    examples: examples('pushSubscribeRequest'),
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @EmployeeOnly()
  async subscribeEmployee(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    const sub = await this.pushService.saveSubscription(
      user.userId,
      dto,
      'EMPLOYEE',
    );
    const tickleSent = await this.pushService.tickleUser(user.userId);
    const confirmationSent = await this.pushService.notifyUser(user.userId, {
      title: 'تم تفعيل إشعارات الموظف',
      body: 'ستصلك تنبيهات الإجازات والرواتب هنا',
      url: '/home',
      tag: `push-welcome-employee-${Date.now()}`,
    });
    return {
      id: String(sub._id),
      tickleSent,
      confirmationSent,
    };
  }

  @Delete('employee/push/subscribe')
  @ApiTags('Employee — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Remove a push subscription (employee)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @EmployeeOnly()
  unsubscribeEmployee(
    @CurrentUser() user: AuthUser,
    @Body() body: UnsubscribePushDto,
  ) {
    return this.pushService.removeSubscription(user.userId, body.endpoint);
  }

  @Get('employee/push/inbox')
  @ApiTags('Employee — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Unread in-app notification inbox (employee)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @EmployeeOnly()
  inboxEmployee(@CurrentUser() user: AuthUser) {
    return this.pushService.listUnreadInbox(user.userId);
  }

  @Post('employee/push/inbox/read')
  @ApiTags('Employee — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Mark employee inbox notifications as read' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @EmployeeOnly()
  async inboxEmployeeRead(
    @CurrentUser() user: AuthUser,
    @Body() body: { ids?: string[] },
  ) {
    const modified = await this.pushService.markInboxRead(
      user.userId,
      body?.ids,
    );
    return { modified };
  }

  @Post('employee/push/test')
  @ApiTags('Employee — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Send a test push to the current employee' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @EmployeeOnly()
  async testEmployee(@CurrentUser() user: AuthUser) {
    const sent = await this.pushService.notifyUser(user.userId, {
      title: 'اختبار إشعار الموظف',
      body: 'إذا وصلتك هذه الرسالة فالإشعارات تعمل',
      url: '/home',
      tag: `push-test-employee-${Date.now()}`,
    });
    return { enabled: this.pushService.isEnabled(), sent };
  }

  @Post('delivery/push/subscribe')
  @ApiTags('Delivery — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Save a push subscription (delivery)' })
  @ApiBody({
    type: SavePushSubscriptionDto,
    examples: examples('pushSubscribeRequest'),
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @DeliveryOnly()
  async subscribeDelivery(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    const sub = await this.pushService.saveSubscription(
      user.userId,
      dto,
      'DELIVERY',
    );
    const tickleSent = await this.pushService.tickleUser(user.userId);
    const confirmationSent = await this.pushService.notifyUser(user.userId, {
      title: 'تم تفعيل إشعارات التوصيل',
      body: 'ستصلك تنبيهات الطلبات المسندة إليك هنا',
      url: '/orders',
      tag: `push-welcome-delivery-${Date.now()}`,
    });
    return {
      id: String(sub._id),
      tickleSent,
      confirmationSent,
    };
  }

  @Delete('delivery/push/subscribe')
  @ApiTags('Delivery — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Remove a push subscription (delivery)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @DeliveryOnly()
  unsubscribeDelivery(
    @CurrentUser() user: AuthUser,
    @Body() body: UnsubscribePushDto,
  ) {
    return this.pushService.removeSubscription(user.userId, body.endpoint);
  }

  @Get('delivery/push/inbox')
  @ApiTags('Delivery — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Unread in-app notification inbox (delivery)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @DeliveryOnly()
  inboxDelivery(@CurrentUser() user: AuthUser) {
    return this.pushService.listUnreadInbox(user.userId);
  }

  @Post('delivery/push/inbox/read')
  @ApiTags('Delivery — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Mark delivery inbox notifications as read' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @DeliveryOnly()
  async inboxDeliveryRead(
    @CurrentUser() user: AuthUser,
    @Body() body: { ids?: string[] },
  ) {
    const modified = await this.pushService.markInboxRead(
      user.userId,
      body?.ids,
    );
    return { modified };
  }

  @Post('delivery/push/test')
  @ApiTags('Delivery — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Send a test push to the current courier' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @DeliveryOnly()
  async testDelivery(@CurrentUser() user: AuthUser) {
    const sent = await this.pushService.notifyUser(user.userId, {
      title: 'اختبار إشعار المندوب',
      body: 'إذا وصلتك هذه الرسالة فالإشعارات تعمل',
      url: '/orders',
      tag: `push-test-delivery-${Date.now()}`,
    });
    return { enabled: this.pushService.isEnabled(), sent };
  }

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
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    const sub = await this.pushService.saveSubscription(
      user.userId,
      dto,
      'SHOP_OWNER',
    );
    // Single confirmation push only (no tickle / no inbox duplicate).
    const confirmationSent = await this.pushService.notifyUser(
      user.userId,
      {
        title: 'تم تفعيل الإشعارات',
        body: 'الإشعارات تعمل الآن',
        url: '/home',
        tag: `push-welcome-${Date.now()}`,
      },
      { skipInbox: true },
    );
    return {
      id: String(sub._id),
      confirmationSent,
      keyLens: {
        p256dh: dto.keys.p256dh?.length ?? 0,
        auth: dto.keys.auth?.length ?? 0,
      },
    };
  }

  @Post('wholesale/push/test')
  @ApiTags('Wholesale — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Send a test push to the current shop owner' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  async testShop(@CurrentUser() user: AuthUser) {
    const sent = await this.pushService.notifyUser(user.userId, {
      title: 'اختبار إشعار المتجر',
      body: 'رسالة تجريبية — إذا وصلتك فالاشتراك يعمل',
      url: '/home',
      tag: `push-test-shop-${Date.now()}`,
    });
    return { enabled: this.pushService.isEnabled(), sent };
  }

  @Get('wholesale/push/inbox')
  @ApiTags('Wholesale — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Unread in-app notification inbox (shop)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  inboxShop(@CurrentUser() user: AuthUser) {
    return this.pushService.listUnreadInbox(user.userId);
  }

  @Post('wholesale/push/inbox/read')
  @ApiTags('Wholesale — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Mark shop inbox notifications as read' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  async inboxShopRead(
    @CurrentUser() user: AuthUser,
    @Body() body: { ids?: string[] },
  ) {
    const modified = await this.pushService.markInboxRead(
      user.userId,
      body?.ids,
    );
    return { modified };
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
  async subscribeAdmin(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    const sub = await this.pushService.saveSubscription(
      user.userId,
      dto,
      'ADMIN',
    );
    const tickleSent = await this.pushService.tickleUser(user.userId);
    const confirmationSent = await this.pushService.notifyUser(user.userId, {
      title: 'تم تفعيل إشعارات الإدارة',
      body: 'إذا رأيت هذا، فإشعارات لوحة التحكم تعمل',
      url: '/reports',
      tag: `push-welcome-admin-${Date.now()}`,
    });
    return {
      id: String(sub._id),
      tickleSent,
      confirmationSent,
      keyLens: {
        p256dh: dto.keys.p256dh?.length ?? 0,
        auth: dto.keys.auth?.length ?? 0,
      },
    };
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

  @Get('admin/push/inbox')
  @ApiTags('Admin — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Unread in-app notification inbox (admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  inboxAdmin(@CurrentUser() user: AuthUser) {
    return this.pushService.listUnreadInbox(user.userId);
  }

  @Post('admin/push/inbox/read')
  @ApiTags('Admin — Push')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Mark admin inbox notifications as read' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  async inboxAdminRead(
    @CurrentUser() user: AuthUser,
    @Body() body: { ids?: string[] },
  ) {
    const modified = await this.pushService.markInboxRead(
      user.userId,
      body?.ids,
    );
    return { modified };
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
