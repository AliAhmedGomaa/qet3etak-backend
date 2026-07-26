import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OrdersModule } from '../orders/orders.module';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AdminController } from './admin.controller';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [UsersModule, WalletsModule, OrdersModule, RolesModule],
  controllers: [AdminController, AdminUsersController],
  providers: [PermissionsGuard],
})
export class AdminModule {}
