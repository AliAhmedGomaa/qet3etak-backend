import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { C2bShopProductsController } from './c2b-shop-products.controller';
import { ShopProductsController } from './shop-products.controller';
import { ShopProductsService } from './shop-products.service';
import {
  ShopProduct,
  ShopProductSchema,
} from './schemas/shop-product.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopProduct.name, schema: ShopProductSchema },
    ]),
    UsersModule,
  ],
  controllers: [ShopProductsController, C2bShopProductsController],
  providers: [ShopProductsService],
  exports: [ShopProductsService],
})
export class ShopProductsModule {}
