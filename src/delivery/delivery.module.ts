import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { DeliveryGuysController } from './delivery-guys.controller';
import { DeliveryGuysService } from './delivery-guys.service';
import { DeliveryPhotosCleanupService } from './delivery-photos-cleanup.service';
import { DeliveryShiftsController } from './delivery-shifts.controller';
import { DeliveryShiftsService } from './delivery-shifts.service';
import {
  DeliveryGuy,
  DeliveryGuySchema,
} from './schemas/delivery-guy.schema';
import {
  DeliveryShift,
  DeliveryShiftSchema,
} from './schemas/delivery-shift.schema';

@Module({
  imports: [
    BranchesModule,
    MongooseModule.forFeature([
      { name: DeliveryGuy.name, schema: DeliveryGuySchema },
      { name: DeliveryShift.name, schema: DeliveryShiftSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [DeliveryGuysController, DeliveryShiftsController],
  providers: [
    DeliveryGuysService,
    DeliveryShiftsService,
    DeliveryPhotosCleanupService,
  ],
  exports: [DeliveryGuysService, DeliveryShiftsService],
})
export class DeliveryModule {}
