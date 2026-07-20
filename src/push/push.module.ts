import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PushSubscriptionEntity,
  PushSubscriptionSchema,
} from './schemas/push-subscription.schema';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscriptionEntity.name, schema: PushSubscriptionSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
