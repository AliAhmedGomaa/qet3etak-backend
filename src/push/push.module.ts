import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import {
  PushSubscriptionEntity,
  PushSubscriptionSchema,
} from './schemas/push-subscription.schema';
import {
  AppNotification,
  AppNotificationSchema,
} from './schemas/app-notification.schema';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: PushSubscriptionEntity.name, schema: PushSubscriptionSchema },
      { name: AppNotification.name, schema: AppNotificationSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
