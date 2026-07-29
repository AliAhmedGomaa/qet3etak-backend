import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as bcrypt from 'bcrypt';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { UserRole, UserStatus } from './common/enums/user.enums';
import { getUploadsStaticRoots } from './common/uploads';
import { HealthController } from './health.controller';
import { UsersModule } from './users/users.module';
import { UsersService } from './users/users.service';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { QualitiesModule } from './qualities/qualities.module';
import { ProductsModule } from './products/products.module';
import { WalletsModule } from './wallets/wallets.module';
import { OrdersModule } from './orders/orders.module';
import { PushModule } from './push/push.module';
import { SpecialRequestsModule } from './special-requests/special-requests.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { FinancialsModule } from './financials/financials.module';
import { ChatModule } from './chat/chat.module';
import { DeliveryModule } from './delivery/delivery.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ImportModule } from './import/import.module';
import { ReturnsModule } from './returns/returns.module';
import { ReportsModule } from './reports/reports.module';
import { BranchesModule } from './branches/branches.module';
import { RolesModule } from './roles/roles.module';
import { RolesService } from './roles/roles.service';
import { HrModule } from './hr/hr.module';
import { BrandingModule } from './branding/branding.module';
import { RepairModule } from './repair/repair.module';
import { ShopProductsModule } from './shop-products/shop-products.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>(
          'MONGODB_URI',
          'mongodb://127.0.0.1:27017/qet3etak',
        ),
      }),
    }),
    ServeStaticModule.forRoot(...getUploadsStaticRoots()),
    RolesModule,
    UsersModule,
    AuthModule,
    AdminModule,
    BranchesModule,
    BrandsModule,
    CategoriesModule,
    QualitiesModule,
    ProductsModule,
    WalletsModule,
    OrdersModule,
    PushModule,
    SpecialRequestsModule,
    PurchasingModule,
    FinancialsModule,
    HrModule,
    BrandingModule,
    ChatModule,
    DeliveryModule,
    InvoicesModule,
    ImportModule,
    ReturnsModule,
    ReportsModule,
    RepairModule,
    ShopProductsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  async onModuleInit(): Promise<void> {
    const phone = process.env.ADMIN_PHONE ?? '0500000000';
    const existing = await this.usersService.findByPhone(phone);
    if (existing) return;

    const adminRole = await this.rolesService.findByCodeOrFail(UserRole.ADMIN);
    const passwordHash = await bcrypt.hash(
      process.env.ADMIN_PASSWORD ?? 'Admin123!',
      10,
    );
    await this.usersService.create({
      fullName: 'Platform Admin',
      shopName: 'Qet3etak HQ',
      phone,
      city: 'Riyadh',
      address: 'Head Office',
      commercialRegPhotoUrl: '/uploads/admin-placeholder.png',
      passwordHash,
      roleId: String(adminRole._id),
      role: UserRole.ADMIN,
      status: UserStatus.APPROVED,
    });
  }
}
