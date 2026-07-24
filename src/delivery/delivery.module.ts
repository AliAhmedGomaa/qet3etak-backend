import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeliveryGuysController } from './delivery-guys.controller';
import { DeliveryGuysService } from './delivery-guys.service';
import {
  DeliveryGuy,
  DeliveryGuySchema,
} from './schemas/delivery-guy.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeliveryGuy.name, schema: DeliveryGuySchema },
    ]),
  ],
  controllers: [DeliveryGuysController],
  providers: [DeliveryGuysService],
  exports: [DeliveryGuysService],
})
export class DeliveryModule {}
