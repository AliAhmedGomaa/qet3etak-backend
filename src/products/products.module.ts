import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QualitiesModule } from '../qualities/qualities.module';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    QualitiesModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
