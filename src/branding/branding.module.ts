import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { Branding, BrandingSchema } from './schemas/branding.schema';
import { ShopCustomerAppController } from './shop-customer-app.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Branding.name, schema: BrandingSchema },
    ]),
    UsersModule,
  ],
  controllers: [BrandingController, ShopCustomerAppController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
