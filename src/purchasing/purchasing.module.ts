import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsModule } from '../products/products.module';
import { PurchasingController } from './purchasing.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { SuppliersService } from './suppliers.service';
import { Supplier, SupplierSchema } from './schemas/supplier.schema';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './schemas/purchase-order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
    ]),
    ProductsModule,
  ],
  controllers: [PurchasingController],
  providers: [SuppliersService, PurchaseOrdersService],
  exports: [SuppliersService, PurchaseOrdersService],
})
export class PurchasingModule {}
