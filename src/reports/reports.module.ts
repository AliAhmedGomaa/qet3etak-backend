import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DeliveryGuy,
  DeliveryGuySchema,
} from '../delivery/schemas/delivery-guy.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import {
  ReturnRequest,
  ReturnRequestSchema,
} from '../returns/schemas/return-request.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Wallet, WalletSchema } from '../wallets/schemas/wallet.schema';
import { ReportsController } from './reports.controller';
import { ShopReportsController } from './reports.shop.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Product.name, schema: ProductSchema },
      { name: DeliveryGuy.name, schema: DeliveryGuySchema },
      { name: ReturnRequest.name, schema: ReturnRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReportsController, ShopReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
