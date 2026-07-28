import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BrandsModule } from '../brands/brands.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import {
  C2bRepairController,
  ShopRepairController,
} from './repair.controller';
import { RepairService } from './repair.service';
import {
  RepairBooking,
  RepairBookingSchema,
} from './schemas/repair-booking.schema';
import {
  RepairTicket,
  RepairTicketSchema,
} from './schemas/repair-ticket.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RepairTicket.name, schema: RepairTicketSchema },
      { name: RepairBooking.name, schema: RepairBookingSchema },
    ]),
    UsersModule,
    BrandsModule,
    OrdersModule,
  ],
  controllers: [ShopRepairController, C2bRepairController],
  providers: [RepairService],
  exports: [RepairService],
})
export class RepairModule {}
