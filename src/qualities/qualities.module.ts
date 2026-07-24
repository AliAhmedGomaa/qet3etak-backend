import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { QualitiesController } from './qualities.controller';
import { QualitiesService } from './qualities.service';
import { Quality, QualitySchema } from './schemas/quality.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quality.name, schema: QualitySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [QualitiesController],
  providers: [QualitiesService],
  exports: [QualitiesService],
})
export class QualitiesModule {}
